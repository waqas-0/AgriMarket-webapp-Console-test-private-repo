
export type Language = 'en' | 'fr';

// Specific permissions for granular control
export type Permission =
  | 'VIEW_DASHBOARD'
  | 'VIEW_INVENTORY'
  | 'MANAGE_INVENTORY' // Add/Edit/Delete products, Adjust stock
  | 'VIEW_ORDERS'
  | 'MANAGE_ORDERS' // Process, Ship, Deliver, Cancel
  | 'VIEW_CUSTOMERS'
  | 'MANAGE_CUSTOMERS' // Edit customer details
  | 'VIEW_FINANCE'
  | 'VIEW_ABANDONED_CARTS'
  | 'MANAGE_SETTINGS' // Categories, Locations
  | 'MANAGE_ACCESS_CONTROL'; // Users and Roles

export interface AbandonedCartItem {
  productId: string;
  productName: string;
  quantity: number;
  price: number;
}

export interface AbandonedCart {
  id: string;
  email?: string;
  phone?: string;
  customerName?: string;
  items: AbandonedCartItem[];
  totalAmount: number;
  lastUpdatedAt: string;
  capturedAt: string;
}

export interface RoleDef {
  id: string;
  name: string;
  permissions: Permission[];
  isSystem?: boolean; // If true, cannot be deleted
}

export interface User {
  id: string;
  username: string;
  password?: string; // Optional for display, required for auth logic
  roleId: string;
  name: string;
  image?: string; // Base64 image string
}

export interface AppNotification {
  id: string;
  title: string;
  message: string;
  type: 'info' | 'success' | 'warning' | 'error';
  timestamp: Date;
  read: boolean;
}

// Category is now dynamic, managed by state
export type Category = string;

// Location Management Types
export type LocationType = 'CITY' | 'PICKUP_POINT';

export interface LocationDef {
  id: string;
  name: string;
  type: LocationType;
  parentId?: string; // If pickup point, belongs to a city
  coordinates?: { lat: number; lng: number };
  image?: string; // Base64 or URL
}

export enum OrderStatus {
  PENDING = 'Pending',
  PAID = 'Paid',
  PROCESSING = 'Processing',
  SHIPPED = 'Shipped',
  DELIVERED = 'Delivered',
  CANCELLED = 'Cancelled',
  REFUNDED = 'Refunded'
}

export interface Product {
  id: string;
  sku: string;
  name: string;
  category: Category;
  price: number;
  stock: number;
  unit: string;
  description: string;
  image: string;
  /** Up to 3 image URLs (primary + extras). */
  images?: string[];
}

export interface OrderItem {
  productId: string;
  productName: string;
  quantity: number;
  price: number;
}

export interface Order {
  id: string;
  customerName: string;
  customerPhone: string;
  items: OrderItem[];
  totalAmount: number;
  status: OrderStatus;
  date: string; // Date placed
  deliveryDate: string; // Requested delivery date
  paymentMethod: 'Mobile Money' | 'Cash on Delivery' | 'Card';
  location: string;
  pickupLocationId?: string; // ID of LocationDef if type is PICKUP
  shippingAddress?: {
    address?: string;
    city?: string;
    region?: string;
    lat?: number;
    lng?: number;
  };
  /** Customer confirmed receipt — required before the admin can mark the order delivered. */
  clientConfirmedReceipt?: boolean;
  /** Buyer requested cancellation; awaiting administrator approval. */
  cancellationRequested?: boolean;
  cancellationReason?: string;
}

export interface Customer {
  id: string; // phone number is often used as ID
  firstName: string;
  lastName: string;
  email?: string;
  phone: string;
  location: string; // General City/Area
  physicalAddress?: string; // Specific address text
  coordinates?: { lat: number; lng: number };
  locationImage?: string; // Base64 string for house/location
  profileImageUrl?: string;

  // Derived Stats (calculated at runtime)
  totalOrders?: number;
  totalSpent?: number;
  lastOrderDate?: string;
  status?: 'Active' | 'Inactive';
}

export interface Translation {
  [key: string]: {
    en: string;
    fr: string;
  };
}
