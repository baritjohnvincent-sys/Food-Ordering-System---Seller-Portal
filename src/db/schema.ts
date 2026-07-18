
import { relations } from 'drizzle-orm';
import { integer, pgTable, serial, text, timestamp, numeric, boolean } from 'drizzle-orm/pg-core';

// 1. Users table (Manager/Owner registered via Google Auth or email/password)
export const users = pgTable('users', {
  id: serial('id').primaryKey(),
  sellerId: integer('seller_id'), // ADDED: Links this manager account to their store ID
  uid: text('uid').notNull().unique(), // Firebase Auth UID or generated UID
  email: text('email').notNull(),
  name: text('name'),
  role: text('role').default('Manager').notNull(), // 'Manager' or 'Manager/Owner'
  phone: text('phone'),
  businessName: text('business_name'),
  password: text('password'),
  pin: text('pin'), // 4-digit PIN for Manager/Owner access
  photoUrl: text('photo_url'),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

// 2. Staff profiles (Now tied to their specific store)
export const staff = pgTable('staff', {
  id: serial('id').primaryKey(),
  sellerId: integer('seller_id').notNull(), // ADDED: Tracks which store location this staff belongs to
  uid: text('uid').notNull().unique(), // Stable unique identifier across syncs (e.g. UUID)
  email: text('email'), // Optional email for staff login
  name: text('name').notNull(),
  pin: text('pin'), // 4-digit PIN for quick cashier lock screens
  role: text('role').default('Staff').notNull(), // 'Manager' or 'Staff'
  status: text('status').default('active').notNull(), // 'active', 'inactive'
  phone: text('phone'),
  businessName: text('business_name'),
  password: text('password'),
  photoUrl: text('photo_url'),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

// 3. Menu Items (Linked to the store ID)
export const menuItems = pgTable('menu_items', {
  id: text('id').primaryKey(), // Client-created stable UUID
  sellerId: integer('seller_id').notNull(), // ADDED: Tracks which store owns this menu item
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

// 4. Orders Table
export const orders = pgTable('orders', {
  id: text('id').primaryKey(), // Client-generated UUID (matches Customer orders.id)
  sellerId: integer('seller_id').notNull(), // ADDED: Ensures synced orders end up in the right tenant dashboard
  orderNumber: text('order_number').notNull(), // e.g., "ORD-1002"
  customerName: text('customer_name'),
  customerPhone: text('customer_phone'),
  deliveryAddress: text('delivery_address'),
  itemsJson: text('items_json').notNull(), // Kept for fast local offline caching & UI rendering
  totalAmount: numeric('total_amount', { precision: 10, scale: 2 }).notNull(),
  paymentStatus: text('payment_status').default('unpaid').notNull(), // 'paid', 'unpaid'
  paymentMethod: text('payment_method').default('cash').notNull(), // 'cash', 'e-wallet', 'card'
  orderStatus: text('order_status').default('received').notNull(), // 'received', 'preparing', 'ready', 'completed', 'cancelled'
  actionBy: text('action_by').default('System').notNull(), // Staff who processed it
  stockReduced: boolean('stock_reduced').default(false).notNull(),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

// 5. NEW: Order Items Table (Normalized item splits for clean sales metrics)
export const orderItems = pgTable('order_items', {
  id: serial('id').primaryKey(),
  orderId: text('order_id').notNull(), // Matches orders.id (UUID)
  productId: text('product_id').notNull(), // Matches menuItems.id (UUID)
  productName: text('product_name').notNull(),
  price: numeric('price', { precision: 10, scale: 2 }).notNull(),
  quantity: integer('quantity').notNull().default(1),
});

// 6. Employee Audit Trails
export const auditLogs = pgTable('audit_logs', {
  id: text('id').primaryKey(), // Client-created stable UUID
  sellerId: integer('seller_id'), // ADDED: Keeps logs mapped to their store
  employeeName: text('employee_name').notNull(),
  role: text('role').notNull(),
  action: text('action').notNull(),
  timestamp: timestamp('timestamp').defaultNow(),
});

// =========================================================================
// DRIZZLE RELATIONS (For clean nested queries)
// =========================================================================

export const ordersRelations = relations(orders, ({ many }) => ({
  items: many(orderItems),
}));

export const orderItemsRelations = relations(orderItems, ({ one }) => ({
  order: one(orders, {
    fields: [orderItems.orderId],
    references: [orders.id],
  }),
  product: one(menuItems, {
    fields: [orderItems.productId],
    references: [menuItems.id],
  }),
}));

export const staffRelations = relations(staff, ({ one }) => ({
  user: one(users, {
    fields: [staff.sellerId],
    references: [users.sellerId],
  }),
}));