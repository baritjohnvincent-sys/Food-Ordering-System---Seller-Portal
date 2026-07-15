import { relations } from 'drizzle-orm';
import { integer, pgTable, serial, text, timestamp, numeric, boolean } from 'drizzle-orm/pg-core';

// Users table (Manager/Owner registered via Google Auth)
export const users = pgTable('users', {
  id: serial('id').primaryKey(),
  uid: text('uid').notNull().unique(), // Firebase Auth UID
  email: text('email').notNull(),
  name: text('name'),
  role: text('role').default('Manager').notNull(), // 'Manager'
  createdAt: timestamp('created_at').defaultNow(),
});

// Staff profiles created by manager (synced to cloud)
export const staff = pgTable('staff', {
  id: serial('id').primaryKey(),
  uid: text('uid').notNull().unique(), // Stable unique identifier across syncs (e.g. UUID)
  name: text('name').notNull(),
  pin: text('pin').notNull(), // 4-digit numeric PIN for quick switching on app entry
  role: text('role').default('Staff').notNull(), // 'Manager' or 'Staff'
  status: text('status').default('active').notNull(), // 'active', 'inactive'
  photoUrl: text('photo_url'), // Profile picture of staff (base64 or URL)
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

// Menu Items (for inventory and prices, synced to cloud)
export const menuItems = pgTable('menu_items', {
  id: text('id').primaryKey(), // Client-created stable UUID
  name: text('name').notNull(),
  category: text('category').notNull(), // e.g., Mains, Drinks, Desserts
  price: numeric('price', { precision: 10, scale: 2 }).notNull(),
  inventoryQty: integer('inventory_qty').default(0).notNull(),
  sku: text('sku'), // Barcode or shortcode
  status: text('status').default('active').notNull(), // 'active' or 'archived'
  updatedAt: timestamp('updated_at').defaultNow(),
  ingredientsJson: text('ingredients_json'), // Stringified JSON array of ingredients
  allergensJson: text('allergens_json'), // Stringified JSON array of allergens
  image: text('image'), // Public URL of the menu item image
});

// Orders (placed offline-first, synced to cloud)
export const orders = pgTable('orders', {
  id: text('id').primaryKey(), // Client-generated UUID
  orderNumber: text('order_number').notNull(), // e.g., "ORD-1002"
  customerName: text('customer_name'),
  customerPhone: text('customer_phone'),
  deliveryAddress: text('delivery_address'),
  itemsJson: text('items_json').notNull(), // JSON list of items ordered: [{id, name, qty, price}]
  totalAmount: numeric('total_amount', { precision: 10, scale: 2 }).notNull(),
  paymentStatus: text('payment_status').default('unpaid').notNull(), // 'paid', 'unpaid'
  paymentMethod: text('payment_method').default('cash').notNull(), // 'cash', 'e-wallet', 'card'
  orderStatus: text('order_status').default('received').notNull(), // 'received', 'preparing', 'ready', 'completed', 'cancelled'
  actionBy: text('action_by').default('System').notNull(), // Staff or Manager who processed it
  stockReduced: boolean('stock_reduced').default(false).notNull(),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

// Employee Audit Trails for employee actions (synced to cloud)
export const auditLogs = pgTable('audit_logs', {
  id: text('id').primaryKey(), // Client-created stable UUID
  employeeName: text('employee_name').notNull(),
  role: text('role').notNull(),
  action: text('action').notNull(), // description of action
  timestamp: timestamp('timestamp').defaultNow(),
});
