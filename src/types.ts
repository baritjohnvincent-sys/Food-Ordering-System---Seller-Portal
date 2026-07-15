export interface MenuItem {
  id: string;
  name: string;
  category: string;
  price: number;
  inventoryQty: number;
  sku: string | null;
  status: 'active' | 'archived';
  updatedAt: string;
  ingredients?: string[];
  allergens?: string[];
  image?: string;
}

export interface OrderItem {
  id: string;
  name: string;
  qty: number;
  price: number;
  notes?: string;
  allergies?: string[];
  allergyAction?: 'remove' | 'alternative' | 'custom';
  allergyDetails?: string;
}

export interface Order {
  id: string;
  orderNumber: string;
  customerName: string | null;
  items: OrderItem[];
  totalAmount: number;
  paymentStatus: 'paid' | 'unpaid';
  paymentMethod: 'cash' | 'e-wallet' | 'card';
  orderStatus: 'received' | 'preparing' | 'ready' | 'completed' | 'cancelled';
  actionBy: string;
  stockReduced?: boolean;
  customerPhone?: string | null;
  deliveryAddress?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface StaffMember {
  id?: number;
  uid: string;
  name: string;
  pin: string; // 4-digit code
  role: 'Manager' | 'Staff';
  status: 'active' | 'inactive';
  photoUrl?: string;
  createdAt?: string;
  updatedAt: string;
}

export interface AuditLog {
  id: string;
  employeeName: string;
  role: string;
  action: string;
  timestamp: string;
}

export type Theme = 'light' | 'dark';
export type SyncStatus = 'idle' | 'syncing' | 'success' | 'error';
export type ActiveTab = 'pos' | 'orders' | 'inventory' | 'staff' | 'analytics' | 'audit' | 'customer_sim' | 'security_hub';
