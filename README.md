# Food Ordering - Seller Portal 🍕🍔

Maligayang pagdating sa **Food Ordering - Seller Portal**! Ito ay isang full-stack management system na idinisenyo para sa mga restawran at tindahan ng pagkain. Sa tulong ng system na ito, mas mabilis at organisado ang pagtanggap ng orders, pamamahala sa imbentaryo, pag-track ng benta, at pag-monitor ng staff.

Ang system na ito ay binuo gamit ang **React 18 (Vite)** sa frontend, **Express** sa backend, at **MySQL** para sa kumpletong database persistence na walang gamit na temporary o lokal na `.json` files.

---

## 🗺️ System Flow (Daloy ng System)

Tumatakbo ang system sa isang secure at synchronized na workflow:

```
[Customer Simulator / Admin APIs] ──► [Express API Endpoints (/api/public/*)]
                                             │
                                             ▼
[Staff / Manager Login with PIN]   ──► [MySQL Database (Durable Persistence)]
                                             │
                                             ▼
[POS Ordering & Inventory Check]   ──► [Reduce Inventory & Create Order]
                                             │
                                             ▼
[OTP 2FA Verification (Gmail/SMTP)] ─► [Secure Status Changes / Staff Audits]
```

1. **Authentication Flow (Pag-login ng Staff/Manager):**
   - Ang mga Staff at Manager ay gumagamit ng kanilang **Unique 4-digit PIN** o email para mag-login.
   - Para sa mga administrative at kritikal na operasyon tulong ng Security Hub, kailangan ang **OTP 2FA (One-Time Password)** na ipinapadala sa kanilang rehistradong email gamit ang email engine.

2. **POS (Point of Sale) & Order Placement Flow:**
   - Pipili ang cashier ng mga pagkain mula sa menu.
   - Maaaring maglagay ng **Allergy Warnings at Allergy Actions** (`remove`, `alternative`, `custom`) bawat item kung ang customer ay may allergy.
   - Bago ma-place ang order, tinitingnan ng system kung sapat ang **Inventory Qty**. Kapag kinumpirma ang order, awtomatikong mababawasan ang stock sa MySQL database.

3. **Order Lifecycle & Management Flow:**
   - Pagkapasok ng order, ito ay magiging `received`.
   - Ipoproseso ito ng kusina habang ina-update ang status: `received` ➔ `preparing` ➔ `ready` ➔ `completed` (o `cancelled` kung kinakailangan).
   - Sa bawat pagbabago ng status ng order, nag-o-output ang thermal printer component ng resibo (`ThermalReceipt.tsx`).

4. **Real-time Synchronization Flow:**
   - Nakikipag-ugnayan ang portal sa panlabas na Customer at Admin Modules gamit ang `VITE_CUSTOMER_API_URL` at `VITE_ADMIN_API_URL`.
   - Ang anumang pagbabago sa menu o orders ay nag-ti-trigger ng synchronization sa pagitan ng local MySQL database at ng external APIs.

5. **Audit Trails Flow:**
   - Lahat ng mahahalagang aksyon (tulad ng pagbabago ng presyo, pag-update ng order status, pag-edit ng staff) ay awtomatikong tinatala sa `audit_logs` table sa MySQL para sa seguridad at accountability.

---

## ✨ Mga Pangunahing Features (Core Functions & Features)

*   **🛒 POS Terminal (Point of Sale):**
    *   Dynamic Category filtering (Appetizers, Mains, Drinks, Desserts, atbp.).
    *   Rich shopping cart management na may support para sa payment methods (Cash, Card, E-Wallet).
    *   **Allergy Custom Actions:** Pinapayagan ang mga cashier na magtakda ng custom adjustments para sa mga allergen ng customer.
*   **📦 Real-time Inventory Management:**
    *   I-add, i-edit, o i-archive ang mga pagkain sa menu.
    *   Awtomatikong SKU Generation at monitoring ng stock.
    *   *Low-stock Alerts* na nagpapakita kapag malapit nang maubos ang sangkap.
*   **👥 Staff & Manager Hub:**
    *   Gumawa ng bagong profiles para sa staff at mag-assign ng kanilang kaukulang roles (`Manager` o `Staff`).
    *   Bawat staff ay may sariling secure na 4-digit PIN upang maiwasan ang un-authorized access sa POS at admin tabs.
*   **📊 Advanced Analytics Dashboard:**
    *   Ipinapakita ang kabuuang benta, active orders, at bilang ng transaksyon.
    *   Interactive bar charts at pie charts gamit ang Recharts upang makita ang pinakamabentang putahe (Top-selling items).
*   **🔒 Security Hub & OTP Engine:**
    *   OTP verification via email para sa sensitibong transaksyon o password resets.
    *   Robust secure connection setup nang walang nakalantad na mock credentials sa client-side.
*   **📋 Automatic System Audit Logging:**
    *   Bawat update sa menu, orders, at pag-login ng staff ay naitatala sa database na naglalaman ng pangalan ng staff, tungkulin, at oras ng aksyon.
*   **💻 Customer Simulator:**
    *   Built-in tab para magkunwaring customer at magpadala ng test orders para masubukan ang bilis ng system.

---

## 🛠️ Mga Dapat I-install sa Terminal (Prerequisites)

Bago patakbuhin ang system, siguraduhing naka-install ang mga sumusunod sa iyong local computer:

1.  **Node.js (v18.x o mas mataas):**
    *   Kailangan para mapatakbo ang server at frontend bundler.
    *   I-download at i-install mula sa: [nodejs.org](https://nodejs.org/)
2.  **MySQL Server (v8.0 o mas mataas) / MySQL Workbench:**
    *   Ito ang gagamiting lalagyan ng database.
    *   I-download at i-install mula sa: [dev.mysql.com/downloads/installer/](https://dev.mysql.com/downloads/mysql/)
3.  **Git (Optional):**
    *   Para sa pag-clone ng repository.

---

## 🚀 Hakbang sa Pag-run ng System (Step-by-Step Guide)

Sundan ang mga hakbang na ito para mapagana ang application sa iyong local computer:

### 1. I-install ang mga Dependencies
Buksan ang iyong terminal o command prompt sa folder ng proyekto at i-type:
```bash
npm install
```
Ito ay mag-i-install ng lahat ng packages na nakalista sa `package.json` (kabilang ang `express`, `mysql2`, `nodemailer`, `vite`, `recharts`, atbp.).

### 2. I-configure ang Environment Variables (`.env`)
Gumawa ng bagong file sa root folder at pangalanan itong `.env` (o kopyahin ang laman mula sa `.env.example`). Punan ang mga sumusunod na detalye:

```env
# Database Type (Naka-default na sa mysql ngayon)
DB_TYPE=mysql

# MySQL Connection Details (I-akma sa iyong local MySQL setup)
MYSQL_HOST=localhost
MYSQL_PORT=3306
MYSQL_USER=root
MYSQL_PASSWORD=iyong_mysql_password_dito
MYSQL_DB_NAME=food_ordering_db

# API Integration URLs para sa Customer at Admin modules
VITE_ADMIN_API_URL=https://visible-whomever-sprint.ngrok-free.dev/
VITE_CUSTOMER_API_URL=https://visible-whomever-sprint.ngrok-free.dev/

# Real Email SMTP Authentication & OTP Engine
# (Inirerekomenda ang Gmail App Password para sa mabilis at ligtas na pagpapadala)
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=iyong_email@gmail.com
SMTP_PASS=iyong_16_digit_app_password_mula_sa_google
SMTP_FROM="Food Ordering System" <iyong_email@gmail.com>
```

> **Tandaan sa Gmail App Password:** Huwag gamitin ang iyong mismong password sa Gmail. Pumunta sa iyong [Google Account Security Settings](https://myaccount.google.com/apppasswords), gumawa ng bagong "App Password", at gamitin ang 16-character code na ibibigay bilang `SMTP_PASS`.

### 3. I-setup ang Iyong MySQL Database
1. Buksan ang **MySQL Workbench** o gamitin ang MySQL Command Line Client.
2. Gumawa ng bagong database (Schema) na kapareho ng pangalan sa `.env` file (`MYSQL_DB_NAME`):
   ```sql
   CREATE DATABASE food_ordering_db;
   ```
3. **Hindi mo na kailangang mag-import ng `.sql` file nang manu-mano!** Ang aming system ay may tampok na **Auto-Bootstrapping**. Pagka-start pa lamang ng server, awtomatiko nitong gagawin ang mga kinakailangang tables (`users`, `staff`, `menu_items`, `orders`, `audit_logs`) kung wala pa ang mga ito sa iyong schema.

### 4. Patakbuhin ang Development Server
I-execute ang utos na ito sa terminal para masimulan ang backend at frontend:
```bash
npm run dev
```
Pagkatapos nito, bubuksan ng system ang local server:
*   Frontend at backend server ay tatakbo sa: **`http://localhost:3000`**

### 5. Pag-build para sa Production (Deployable Package)
Kung handa na ang app para sa deployment, maaari mo itong i-compile:
```bash
npm run build
```
Upang patakbuhin ang compiled production package:
```bash
npm start
```

---

## 🧠 Paano Ito Gumagana Sa Ilalim ng Hood? (Under the Hood Architecture)

*   **Pure MySQL Architecture (Walang JSON):**
    Ang system ay gumagamit ng native `mysql2/promise` pooling engine sa `/src/db/index.ts` upang makipag-usap sa MySQL server. Ang old offline storage sa `local_database.json` ay tinanggal na para sa mas mabilis, mas matatag, at pangmatagalang datos na angkop sa totoong produksyon.
*   **Dual Frontend/Backend Express proxy:**
    Ang Express application ay nagsisilbing backend API host at kasabay nito, pinapatakbo nito ang Vite bilang isang middleware sa development mode. Sa ganitong paraan, iisang port (`3000`) lamang ang kailangan patakbuhin para sa buong full-stack system.
*   **Nodemailer Direct Delivery:**
    Wala nang mapanganib o hindi maaasahang public testing sandbox (tulad ng Ethereal Email fallbacks). Ang system ay gumagamit na ngayon ng secure at direktang SMTP routing upang mapabilis ang pagpapadala ng OTPs sa pamamagitan ng iyong sariling SMTP server.
