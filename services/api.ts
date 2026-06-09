import {
    Order,
    Product,
    User,
    RoleDef,
    Customer,
    LocationDef,
    OrderStatus,
    Permission,
    AbandonedCart,
} from '../types';
import {
    API_BASE,
    getAccessToken,
    setAccessToken,
    setRefreshToken,
    attemptTokenRefresh,
    dispatchUnauthorized,
} from './auth';

/**
 * Many list endpoints on the API return a paginated envelope:
 *   { data: T[], total: number, page: number, limit: number }
 * Older / public endpoints return a plain T[].
 * This helper accepts either shape and always yields a T[].
 */
function unwrapList<T>(payload: any): T[] {
    if (Array.isArray(payload)) return payload as T[];
    if (payload && Array.isArray(payload.data)) return payload.data as T[];
    return [];
}

/** Backend PaginationDto allows limit 1–100 only (forbidNonWhitelisted on other query keys). */
const MAX_PAGE_LIMIT = 100;

function buildQuery(params: Record<string, string | number | undefined>): string {
    const qs = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) {
        if (value !== undefined && value !== '') {
            qs.set(key, String(value));
        }
    }
    const s = qs.toString();
    return s ? `?${s}` : '';
}

/**
 * Fetch all pages of a paginated endpoint in parallel.
 * Strategy: fetch page 1 to learn `total`, then fire all remaining pages
 * concurrently instead of sequentially. For N pages this reduces wall-clock
 * time from N × RTT down to roughly 2 × RTT.
 */
async function fetchAllPages<T>(
    path: string,
    extraQuery: Record<string, string | number | undefined> = {},
): Promise<T[]> {
    const firstPayload = await fetchClient<any>(
        `${path}${buildQuery({ ...extraQuery, page: 1, limit: MAX_PAGE_LIMIT })}`,
    );
    const firstBatch = unwrapList<T>(firstPayload);
    const total = typeof firstPayload?.total === 'number' ? firstPayload.total : undefined;

    // Everything arrived in the first page — return immediately.
    if (firstBatch.length < MAX_PAGE_LIMIT || (total != null && firstBatch.length >= total)) {
        return firstBatch;
    }

    // Calculate how many more pages we need (cap at 49 extra pages).
    const totalItems = total ?? firstBatch.length * 50;
    const totalPages = Math.min(Math.ceil(totalItems / MAX_PAGE_LIMIT), 50);

    if (totalPages <= 1) return firstBatch;

    // Fire all remaining pages concurrently.
    const remainingPages = Array.from({ length: totalPages - 1 }, (_, i) => i + 2);
    const remainingBatches = await Promise.all(
        remainingPages.map(page =>
            fetchClient<any>(`${path}${buildQuery({ ...extraQuery, page, limit: MAX_PAGE_LIMIT })}`)
                .then(payload => unwrapList<T>(payload))
                .catch(() => [] as T[]),
        ),
    );

    return [firstBatch, ...remainingBatches].flat();
}

// --- CORE FETCH WRAPPER ---
/**
 * Centralized fetch client that injects the Bearer token,
 * handles 401 globally with refresh-token rotation, and parses JSON responses uniformly.
 *
 * On 401 we try POST /auth/refresh exactly once. If a fresh access token comes
 * back we re-issue the original request transparently; otherwise we clear the
 * session and let App.tsx fall back to the login screen.
 */
async function fetchClient<T>(
    endpoint: string,
    options: RequestInit = {},
    isRetry = false,
): Promise<T> {
    const token = getAccessToken();

    const headers: HeadersInit = {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...options.headers,
    };

    const config: RequestInit = { ...options, headers };

    try {
        const response = await fetch(`${API_BASE}${endpoint}`, config);

        if (response.status === 401) {
            if (!isRetry) {
                const refreshed = await attemptTokenRefresh();
                if (refreshed) {
                    return fetchClient<T>(endpoint, options, true);
                }
            }
            dispatchUnauthorized();
            throw new Error('Unauthorized');
        }

        if (!response.ok) {
            let errorMessage = `API Error: ${response.status} ${response.statusText}`;
            try {
                const errorData = await response.json();
                errorMessage = errorData.message || errorMessage;
            } catch { /* ignore parse errors */ }
            throw new Error(errorMessage);
        }

        // Handle 204 No Content responses
        const text = await response.text();
        if (!text) return {} as T;
        return JSON.parse(text) as T;

    } catch (error) {
        console.error(`[API Error] ${options.method || 'GET'} ${endpoint}:`, error);
        throw error;
    }
}

// --- HELPERS to map API shapes to Frontend types ---

/**
 * Maps the API User object to the frontend User type.
 * The API returns: { id, email, displayName, role, ... }
 * The frontend expects: { id, username, name, roleId, ... }
 */
function mapApiUserToFrontend(apiUser: any): User {
    return {
        id: apiUser.id,
        username: apiUser.email,       // use email as username
        name: apiUser.displayName,
        roleId: apiUser.role,          // use role string as roleId
        image: apiUser.profileImageUrl || undefined,
    };
}

/**
 * Maps API Offer (marketType: ATI) to the frontend Product type.
 */
function mapApiOfferToProduct(offer: any): Product {
    const extras = Array.isArray(offer.imageUrls)
        ? offer.imageUrls.map((u: unknown) => String(u).trim()).filter(Boolean)
        : [];
    const primary = (offer.imageUrl && String(offer.imageUrl).trim()) || '';
    const images = [primary, ...extras].filter(Boolean).slice(0, 3);
    return {
        id: offer.id,
        sku: offer.id.substring(0, 8).toUpperCase(),
        name: offer.title,
        category: offer.category,
        price: Number(offer.price),
        stock: Number(offer.quantity),
        unit: offer.unit,
        description: offer.description,
        image: images[0] || '',
        images,
    };
}

/**
 * Maps API Order to the frontend Order type.
 */
function toDateOnly(value: unknown): string {
    if (!value) return '';
    const d = new Date(String(value));
    if (Number.isNaN(d.getTime())) return String(value).slice(0, 10);
    const offset = d.getTimezoneOffset();
    const local = new Date(d.getTime() - offset * 60 * 1000);
    return local.toISOString().split('T')[0];
}

function mapApiOrderToFrontend(order: any): Order {
    const profile = order.clientProfile;
    const profileName = profile
        ? [profile.firstName, profile.lastName].filter(Boolean).join(' ').trim()
        : '';
    const customerName =
        order.clientProfile?.user?.displayName || profileName || 'Unknown';

    return {
        id: order.id,
        customerName,
        customerPhone: order.clientProfile?.user?.phone || '',
        items: (order.orderItems || []).map((item: any) => ({
            productId: item.offerId,
            productName: item.title,
            quantity: item.cartQuantity,
            price: Number(item.price),
        })),
        totalAmount: Number(order.totalAmount),
        status: mapApiOrderStatus(order.status),
        date: order.createdAt || new Date().toISOString(),
        deliveryDate: toDateOnly(order.requestedDeliveryDate),
        paymentMethod: 'Mobile Money',
        location:
            order.shippingAddress?.address ||
            [order.shippingAddress?.city, order.shippingAddress?.region].filter(Boolean).join(', ') ||
            order.pickupPoint?.address ||
            order.pickupPoint?.city ||
            order.deliveryMethod ||
            '',
        pickupLocationId: order.pickupPointId || undefined,
        shippingAddress: order.shippingAddress || undefined,
        clientConfirmedReceipt: order.clientConfirmedReceipt ?? false,
        cancellationRequested: order.cancellationRequested ?? false,
        cancellationReason: order.cancellationReason ?? undefined,
    };
}

function mapApiOrderStatus(status: string): OrderStatus {
    const map: Record<string, OrderStatus> = {
        PENDING_VALIDATION: OrderStatus.PENDING,
        CONFIRMED: OrderStatus.PAID,
        CONFIRMED_AWAITING_PAYMENT: OrderStatus.PAID,
        PAID_IN_PREPARATION: OrderStatus.PROCESSING,
        PROCESSING: OrderStatus.PROCESSING,
        SHIPPED: OrderStatus.SHIPPED,
        IN_TRANSIT: OrderStatus.SHIPPED,
        DELIVERED: OrderStatus.DELIVERED,
        CANCELED: OrderStatus.CANCELLED,
        CANCELLED: OrderStatus.CANCELLED,
        DISPUTED: OrderStatus.CANCELLED,
        DISPUTE: OrderStatus.CANCELLED,
    };
    return map[status] || OrderStatus.PENDING;
}

function mapFrontendStatusToApi(status: OrderStatus): string {
    const map: Record<OrderStatus, string> = {
        [OrderStatus.PENDING]: 'PENDING_VALIDATION',
        [OrderStatus.PAID]: 'CONFIRMED_AWAITING_PAYMENT',
        [OrderStatus.PROCESSING]: 'PAID_IN_PREPARATION',
        [OrderStatus.SHIPPED]: 'IN_TRANSIT',
        [OrderStatus.DELIVERED]: 'DELIVERED',
        [OrderStatus.CANCELLED]: 'CANCELED',
        [OrderStatus.REFUNDED]: 'CANCELED',
    };
    return map[status] || 'PENDING_VALIDATION';
}

function mapAbandonedCart(cart: any): AbandonedCart {
    const items = (cart.items || []).map((item: any) => ({
        productId: item.offerId || item.offer?.id || '',
        productName: item.offer?.title || 'Item',
        quantity: Number(item.quantity ?? 0),
        price: Number(item.offer?.price ?? item.price ?? 0),
    }));
    const totalAmount = items.reduce(
        (sum: number, i: { price: number; quantity: number }) => sum + i.price * i.quantity,
        0,
    );
    return {
        id: cart.id,
        email: cart.user?.email,
        phone: cart.user?.phone,
        customerName: cart.user?.displayName,
        items,
        totalAmount,
        lastUpdatedAt: cart.updatedAt || new Date().toISOString(),
        capturedAt: cart.createdAt || cart.updatedAt || new Date().toISOString(),
    };
}

// --- ROLE & PERMISSION SYSTEM ---
// The API uses flat role strings. We map these to rich frontend objects
// that define exactly what each role is permitted to see and do.

const ADMIN_PANEL_PERMISSIONS: Permission[] = [
    'VIEW_DASHBOARD', 'VIEW_INVENTORY', 'MANAGE_INVENTORY',
    'VIEW_ORDERS', 'MANAGE_ORDERS', 'VIEW_CUSTOMERS',
    'MANAGE_CUSTOMERS', 'VIEW_FINANCE', 'VIEW_ABANDONED_CARTS',
    'MANAGE_SETTINGS', 'MANAGE_ACCESS_CONTROL',
];

const ROLE_PERMISSIONS: Record<string, RoleDef> = {
    SUPER_ADMIN: {
        id: 'SUPER_ADMIN',
        name: 'Super Administrator',
        isSystem: true,
        permissions: ADMIN_PANEL_PERMISSIONS,
    },
    ADMIN: {
        id: 'ADMIN',
        name: 'Full Administrator',
        isSystem: true,
        permissions: ADMIN_PANEL_PERMISSIONS,
    },
    RETAIL_ADMIN: {
        id: 'RETAIL_ADMIN',
        name: 'Retail Administrator',
        isSystem: true,
        permissions: ADMIN_PANEL_PERMISSIONS,
    },
    MANAGER: {
        id: 'MANAGER',
        name: 'Store Manager',
        isSystem: false,
        permissions: [
            'VIEW_DASHBOARD', 'VIEW_INVENTORY', 'MANAGE_INVENTORY',
            'VIEW_ORDERS', 'MANAGE_ORDERS', 'VIEW_CUSTOMERS',
            'VIEW_FINANCE', 'VIEW_ABANDONED_CARTS',
        ],
    },
    STAFF: {
        id: 'STAFF',
        name: 'Inventory Staff',
        isSystem: false,
        permissions: ['VIEW_DASHBOARD', 'VIEW_INVENTORY', 'VIEW_ORDERS'],
    },
};

/**
 * Returns a RoleDef based on the backend role string.
 * Defaults to a minimal 'STAFF' role if unknown.
 */
function getRoleDef(role: string): RoleDef {
    return ROLE_PERMISSIONS[role] || ROLE_PERMISSIONS.STAFF;
}

/** Resolve role for App shell when settings.getRoles() list does not include JWT role yet. */
export function resolveRoleDef(roleId: string): RoleDef {
    return getRoleDef(roleId);
}

/** Build CITY + PICKUP_POINT hierarchy from API pickup point rows. */
function mapPickupPointsToLocations(points: any[]): LocationDef[] {
    const cities = new Map<string, LocationDef>();
    const locations: LocationDef[] = [];

    for (const p of points) {
        const cityName = String(p.city || 'Unknown').trim();
        const cityId = `city:${cityName}`;
        if (!cities.has(cityId)) {
            const city: LocationDef = { id: cityId, name: cityName, type: 'CITY' };
            cities.set(cityId, city);
            locations.push(city);
        }
        locations.push({
            id: p.id,
            name: p.name,
            type: 'PICKUP_POINT',
            parentId: cityId,
        });
    }
    return locations;
}

// --- API IMPLEMENTATION ---
export const api = {
    auth: {
        /**
         * Login — the API accepts an email OR a phone number under a single `identifier`
         * field (see LoginDto). The global ValidationPipe rejects unknown properties
         * (forbidNonWhitelisted), so we must NOT send `email`.
         * The API returns { accessToken, refreshToken?, user }.
         */
        login: async (identifier: string, password: string): Promise<User | null> => {
            try {
                const loginBody = {
                    identifier: identifier.trim(),
                    password,
                };
                const data = await fetchClient<{ accessToken: string; refreshToken: string; user: any }>('/auth/login', {
                    method: 'POST',
                    body: JSON.stringify(loginBody),
                });

                // The backend role enum exposes SUPER_ADMIN, ADMIN (legacy), RETAIL_ADMIN
                // as the roles that can hit /api/admin/* and /api/retail/admin/* endpoints
                // used by this dashboard.
                const allowedRoles = ['SUPER_ADMIN', 'ADMIN', 'RETAIL_ADMIN'];
                const blockedMarketplaceRoles = ['CLIENT', 'PRODUCER', 'MANAGER'];
                if (!data.user?.role || !allowedRoles.includes(data.user.role)) {
                    console.warn('[Auth] Login rejected: insufficient privileges');
                    return null;
                }
                if (blockedMarketplaceRoles.includes(data.user.role)) {
                    console.warn('[Auth] Marketplace accounts must use the Connect web app');
                    return null;
                }

                if (data.accessToken) {
                    setAccessToken(data.accessToken);
                }
                if (data.refreshToken) {
                    setRefreshToken(data.refreshToken);
                }

                return mapApiUserToFrontend(data.user);
            } catch (e) {
                console.error('[Auth] Login failed:', e);
                return null;
            }
        },

        /**
         * Validate existing session using the stored access token.
         * If the access token is expired but a refresh token is present,
         * fetchClient will silently rotate it before falling back to null.
         */
        validateSession: async (): Promise<User | null> => {
            const token = getAccessToken();
            if (!token) return null;
            try {
                const apiUser = await fetchClient<any>('/auth/me');
                return mapApiUserToFrontend(apiUser);
            } catch {
                return null;
            }
        },

        logout: () => {
            dispatchUnauthorized();
        },

        updateProfile: async (user: User): Promise<User> => {
            // The API does not expose PATCH /auth/profile. Updating displayName / image
            // is done via PUT /users/:id (UpdateUserDto = PartialType(CreateUserDto)).
            const apiUser = await fetchClient<any>(`/users/${user.id}`, {
                method: 'PUT',
                body: JSON.stringify({
                    displayName: user.name,
                    ...(user.image ? { profileImageUrl: user.image } : {}),
                }),
            });
            return mapApiUserToFrontend(apiUser);
        },
    },

    orders: {
        /** ATI retail orders — GET /retail/admin/orders (PaginationDto: page, limit only). */
        getAll: async (): Promise<Order[]> => {
            try {
                const rows = await fetchAllPages<any>('/retail/admin/orders');
                return rows.map(mapApiOrderToFrontend);
            } catch {
                return [];
            }
        },
        updateStatus: async (id: string, status: OrderStatus) => {
            await fetchClient<any>(`/retail/admin/orders/${id}/status`, {
                method: 'PATCH',
                body: JSON.stringify({ status: mapFrontendStatusToApi(status) }),
            });
            return { success: true };
        },
        update: async (order: Order): Promise<Order> => {
            const updated = await fetchClient<any>(`/retail/admin/orders/${order.id}/status`, {
                method: 'PATCH',
                body: JSON.stringify({ status: mapFrontendStatusToApi(order.status) }),
            });
            return mapApiOrderToFrontend(updated);
        },
        /** PATCH /retail/admin/orders/:id/fulfillment — pickup point & delivery method. */
        updateFulfillment: async (
            orderId: string,
            data: { pickupPointId?: string | null; deliveryMethod?: string },
        ): Promise<Order> => {
            const updated = await fetchClient<any>(`/retail/admin/orders/${orderId}/fulfillment`, {
                method: 'PATCH',
                body: JSON.stringify(data),
            });
            return mapApiOrderToFrontend(updated);
        },
    },

    products: {
        /** Get all ATI retail offers */
        getAll: async (): Promise<Product[]> => {
            try {
                const offers = await fetchClient<any>('/retail/offers');
                return unwrapList<any>(offers).map(mapApiOfferToProduct);
            } catch {
                return [];
            }
        },
        create: async (p: Product): Promise<Product> => {
            const imgs = (p.images?.length ? p.images : [p.image]).filter(Boolean).slice(0, 3);
            const created = await fetchClient<any>('/retail/admin/offers', {
                method: 'POST',
                body: JSON.stringify({
                    title: p.name,
                    description: p.description,
                    category: p.category,
                    type: 'PRODUCT',
                    unit: p.unit,
                    quantity: p.stock,
                    price: p.price,
                    imageUrl: imgs[0] || 'https://placehold.co/400',
                    imageUrls: imgs.slice(1),
                    isDeliveryAvailable: true,
                    offerLocation: 'ATI Retail Store',
                    minQuantity: 1,
                    maxQuantity: Math.max(1, p.stock),
                }),
            });
            return mapApiOfferToProduct(created);
        },
        update: async (p: Product): Promise<Product> => {
            const imgs = (p.images?.length ? p.images : [p.image]).filter(Boolean).slice(0, 3);
            const updated = await fetchClient<any>(`/retail/admin/offers/${p.id}`, {
                method: 'PUT',
                body: JSON.stringify({
                    title: p.name,
                    description: p.description,
                    category: p.category,
                    quantity: p.stock,
                    price: p.price,
                    imageUrl: imgs[0],
                    imageUrls: imgs.slice(1),
                }),
            });
            return mapApiOfferToProduct(updated);
        },
        delete: async (id: string): Promise<void> => {
            await fetchClient<void>(`/retail/admin/offers/${id}`, { method: 'DELETE' });
        },
        updateStock: async (id: string, stock: number): Promise<void> => {
            await fetchClient<void>(`/retail/admin/offers/${id}`, {
                method: 'PUT',
                body: JSON.stringify({ quantity: stock }),
            });
        },
    },

    customers: {
        /** Retail CRM clients — GET /retail/admin/clients (pre-filtered CLIENT users). */
        getAll: async (): Promise<Customer[]> => {
            try {
                const rows = await fetchAllPages<any>('/retail/admin/clients');
                return rows.map((u: any) => {
                    const loc = u.clientProfile?.locations?.[0];
                    const latLng = loc?.latLng as { lat?: number; lng?: number } | undefined;
                    return {
                        id: u.id,
                        firstName: u.clientProfile?.firstName || u.displayName?.split(' ')[0] || '',
                        lastName: u.clientProfile?.lastName || u.displayName?.split(' ').slice(1).join(' ') || '',
                        email: u.email,
                        phone: u.phone,
                        location: loc?.city || '',
                        physicalAddress: loc?.address || '',
                        coordinates:
                            latLng && (latLng.lat != null || latLng.lng != null)
                                ? { lat: Number(latLng.lat ?? 0), lng: Number(latLng.lng ?? 0) }
                                : undefined,
                        profileImageUrl: u.profileImageUrl || undefined,
                    };
                });
            } catch {
                return [];
            }
        },
        update: async (c: Customer): Promise<Customer> => {
            const updated = await fetchClient<any>(`/retail/admin/clients/${c.id}`, {
                method: 'PATCH',
                body: JSON.stringify({
                    firstName: c.firstName,
                    lastName: c.lastName,
                    profileImageUrl: c.profileImageUrl ?? null,
                    location: {
                        address: c.physicalAddress || c.location,
                        city: c.location,
                        region: c.location,
                        lat: c.coordinates?.lat,
                        lng: c.coordinates?.lng,
                        locationImageUrl: c.locationImage,
                    },
                }),
            });
            const loc = updated.clientProfile?.locations?.[0];
            const latLng = loc?.latLng as { lat?: number; lng?: number } | undefined;
            return {
                ...c,
                firstName: updated.clientProfile?.firstName ?? c.firstName,
                lastName: updated.clientProfile?.lastName ?? c.lastName,
                physicalAddress: loc?.address ?? c.physicalAddress,
                location: loc?.city ?? c.location,
                coordinates: latLng
                    ? { lat: Number(latLng.lat ?? 0), lng: Number(latLng.lng ?? 0) }
                    : c.coordinates,
                profileImageUrl: updated.profileImageUrl ?? c.profileImageUrl,
            };
        },
    },

    settings: {
        // Categories are derived from offers in the retail context
        getCategories: async (): Promise<string[]> => {
            try {
                const res = await fetchClient<{ categories?: string[] }>('/retail/admin/categories');
                const cats = Array.isArray(res.categories) ? res.categories : [];
                return cats.length ? cats : ['Vegetables', 'Grains', 'Dairy', 'Livestock', 'Fruits', 'Legumes'];
            } catch {
                return ['Vegetables', 'Grains', 'Dairy', 'Livestock', 'Fruits', 'Legumes'];
            }
        },
        /**
         * Pass the current in-memory category list so we skip the extra GET
         * round-trip that was previously issued before every write.
         */
        addCategory: async (category: string, currentCategories: string[]): Promise<void> => {
            if (currentCategories.includes(category)) return;
            await fetchClient('/retail/admin/categories', {
                method: 'PATCH',
                body: JSON.stringify({ categories: [...currentCategories, category] }),
            });
        },
        deleteCategory: async (category: string, currentCategories: string[]): Promise<void> => {
            await fetchClient('/retail/admin/categories', {
                method: 'PATCH',
                body: JSON.stringify({ categories: currentCategories.filter((c) => c !== category) }),
            });
        },

        // Locations from pickup points — derive CITY rows so Orders/Settings filters work.
        getLocations: async (): Promise<LocationDef[]> => {
            try {
                const points = unwrapList<any>(await fetchClient<any>('/admin/pickup-points'));
                return mapPickupPointsToLocations(points);
            } catch {
                return [];
            }
        },
        saveLocation: async (l: LocationDef): Promise<LocationDef | null> => {
            // Virtual cities (Settings “add city”) are local-only until a pickup is created.
            if (l.type === 'CITY' || l.id.startsWith('city:') || l.id.startsWith('loc_')) {
                return l;
            }
            if (l.type === 'PICKUP_POINT' && (l.id.startsWith('loc_pt_') || l.id.startsWith('loc_'))) {
                const cityName = l.parentId?.startsWith('city:')
                    ? l.parentId.slice(5)
                    : l.parentId || 'Unknown';
                const created = await fetchClient<any>('/admin/pickup-points', {
                    method: 'POST',
                    body: JSON.stringify({
                        name: l.name,
                        address: l.name,
                        city: cityName,
                        region: cityName,
                    }),
                });
                const cityId = `city:${created.city || cityName}`;
                return {
                    id: created.id,
                    name: created.name,
                    type: 'PICKUP_POINT',
                    parentId: cityId,
                };
            }
            return l;
        },
        deleteLocation: async (id: string): Promise<void> => {
            if (id.startsWith('city:') || id.startsWith('loc_')) return;
            await fetchClient<void>(`/admin/pickup-points/${id}`, { method: 'DELETE' });
        },

        // Roles — the API uses string roles, so we return the mapped definitions
        getRoles: async (): Promise<RoleDef[]> => {
            return Object.values(ROLE_PERMISSIONS);
        },
        saveRole: async (r: RoleDef): Promise<RoleDef | null> => { return r; },
        deleteRole: async (_id: string): Promise<void> => { },

        // Platform-staff (SUPER_ADMIN, legacy ADMIN, RETAIL_ADMIN) — the roles that
        // actually have access to this dashboard. /admin/platform-staff returns
        // the same shape as /admin/users but pre-filtered to admin-tier roles.
        getUsers: async (): Promise<User[]> => {
            try {
                const rows = await fetchAllPages<any>('/retail/admin/platform-staff');
                return rows.map(mapApiUserToFrontend);
            } catch {
                return [];
            }
        },
        saveUser: async (u: User): Promise<User | null> => {
            if (u.id.startsWith('user_')) {
                const email = u.username.includes('@')
                    ? u.username.trim()
                    : `${u.username.trim().toLowerCase().replace(/\s+/g, '.')}@retail.agrimarket.local`;
                const phoneDigits = u.username.replace(/\D/g, '');
                const phone = u.username.includes('+')
                    ? u.username.trim()
                    : `+237${phoneDigits.length >= 9 ? phoneDigits.slice(-9) : '600000099'}`;
                const created = await fetchClient<any>('/retail/admin/staff', {
                    method: 'POST',
                    body: JSON.stringify({
                        email,
                        phone,
                        password: u.password,
                        displayName: u.name,
                        role: u.roleId === 'SUPER_ADMIN' ? 'SUPER_ADMIN' : 'RETAIL_ADMIN',
                    }),
                });
                return mapApiUserToFrontend(created);
            }
            if (u.password) {
                await fetchClient(`/users/${u.id}`, {
                    method: 'PUT',
                    body: JSON.stringify({
                        displayName: u.name,
                        ...(u.image ? { profileImageUrl: u.image } : {}),
                    }),
                });
            } else {
                await fetchClient(`/users/${u.id}`, {
                    method: 'PUT',
                    body: JSON.stringify({
                        displayName: u.name,
                        ...(u.image ? { profileImageUrl: u.image } : {}),
                    }),
                });
            }
            return { ...u, password: undefined };
        },
        deleteUser: async (id: string): Promise<void> => {
            if (id.startsWith('user_')) return;
            await fetchClient<void>(`/admin/users/${id}`, { method: 'DELETE' });
        },
    },
    abandonedCarts: {
        getAll: async (): Promise<AbandonedCart[]> => {
            try {
                const carts = await fetchClient<any>('/retail/admin/abandoned-carts');
                const list = Array.isArray(carts) ? carts : unwrapList<any>(carts);
                return list.map(mapAbandonedCart);
            } catch {
                return [];
            }
        },
        delete: async (id: string): Promise<void> => {
            await fetchClient<void>(`/retail/admin/abandoned-carts/${id}`, { method: 'DELETE' });
        },
    },
};
