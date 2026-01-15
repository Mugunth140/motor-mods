# MotorMods Billing System - User Manual

Welcome to the **MotorMods Billing System**. This application is designed to help you manage your inventory, process sales, track customers, and generate detailed reports with ease.

## Table of Contents
1.  [Getting Started](#getting-started)
2.  [Dashboard](#dashboard)
3.  [Billing & Checkout](#billing--checkout)
4.  [Product Management](#product-management)
5.  [Transactions & Invoices](#transactions--invoices)
6.  [Reports](#reports)
7.  [Customers](#customers)
8.  [Settings & Administration](#settings--administration)
9.  [Backup & Restore](#backup--restore)

---

## 1. Getting Started

### Installation
The application comes as a standalone desktop installer. Simply run the installer (e.g., `MotorMods-Setup.exe`) and follow the on-screen instructions.

### Logging In
Launch the application from your desktop. You will be greeted with a login screen.
*   **Default Admin Credentials** (for first-time use):
    *   **Username**: `admin`
    *   **Password**: `admin123`
*   *Note: It is highly recommended to change the default password in the Settings menu after your first login.*

---

## 2. Dashboard
The Dashboard provides a quick snapshot of your business performance:
*   **Total Revenue**: Cumulative revenue from all sales.
*   **Today's Revenue**: Sales generated in the current day.
*   **Total Invoices**: Count of all invoices generated.
*   **Recent Activity**: Quick view of the latest transactions.

---

## 3. Billing & Checkout
This is the main screen for processing sales.

### Creating an Invoice
1.  **Search Product**: Use the search bar to find products by name or code.
2.  **Add to Cart**: Click on a product to add it to the billing cart.
3.  **Adjust Quantity**: Use the `+` and `-` buttons in the cart to change quantity.
4.  **Customer Details**:
    *   **Walking Customer**: Selected by default.
    *   **Select Customer**: Click the "Select User" icon to search and choose an existing customer.
    *   **New Customer**: You can add a new customer directly from this screen if needed.

### Checkout Process
1.  **Discount**: Provide a discount amount if applicable.
2.  **Payment Mode**: Select `Cash`.
3.  **Checkout**: Click the **"Checkout"** button.
    *   The invoice will be generated.
    *   A **Print/Save dialog** will appear automatically.
    *   If a printer is connected and configured, it can print silently (if set up); otherwise, it will prompt you to **Save as PDF**.

---

## 4. Product Management
Navigate to the **Inventory** tab to manage your stock.

*   **Add Product**: Click "Add Product", enter details (Name, Category, Price, Cost, Stock), and save.
*   **Edit/Delete**: Use the action buttons next to each product to update details or remove items.
*   **Low Stock Indicators**: Products running low on stock will be highlighted based on your settings.

---

## 5. Transactions & Invoices
View your sales history in the **Transactions** tab.

*   **Search**: Find past invoices by Invoice ID or Customer Name.
*   **View Details**: Click the **"View"** (Eye icon) button to see the full invoice.
*   **Reprint Invoice**:
    1.  Open the invoice details (View).
    2.  Click the **"View"** button again in the modal if needed, then look for the print option. *Note: Printing is triggered from the view details modal.*
    3.  A **"Save As" dialog** will appear. Choose a location to save the PDF invoice.
    4.  The PDF includes your store branding, logo, and full invoice details.

---

## 6. Reports
Gain insights into your business with detailed reports:

*   **Sales Report**: Daily, weekly, or monthly sales summary.
*   **Inventory Report**: Current stock levels and valuation.
*   **Low Stock Report**: List of items that need reordering (Critical/Low status).
*   **Profit Report**: Analysis of profit margins based on Cost Price vs. Selling Price.
*   **Non-Moving Items**: Identify products that haven't sold in a long time (FSN Analysis).
*   **Exports**: All reports can be exported to **PDF** or **CSV** (Excel) formats. The PDF exports include your store header and branding.

---

## 7. Settings & Administration
Customize the application to fit your business.

### General / Store Details
*   **Store Name**: The name that appears on invoices.
*   **Store Details**: Address, Phone Number, and Email. **Make sure to fill this in so your invoices look professional.**
*   **Logo**: Upload your shop's logo to appear on screen and reports.

### User Management
*   **Add Users**: Create accounts for your staff.
*   **Roles**: Assign roles:
    *   **Admin**: Full access to all features including Settings and Backups.
    *   **Staff**: Restricted access (cannot change settings or delete backups).
*   **Change Password**: Update your login credentials securely.

### Backup Settings
*   **Auto-Backup**: Enable automatic daily backups.
*   **Retention**: Choose how long to keep backup files (e.g., 7 days, 30 days).

---

## 8. Backup & Restore
Protect your data from loss.

### Creating a Backup
*   **Auto-Backup**: If enabled in Settings, the system backs up automatically.
*   **Manual Backup**: Go to the **Backups** tab (bottom of sidebar, Admin only) and click **"Backup Now"**.

### Restoring Data
*   **From History**: Select a backup from the list and click **"Restore"**.
*   **From File**: Click "Select Backup File" if you have a `.db` file saved externally.
*   **Important**: When you restore, the application will **close automatically**. You must **reopen** it manually to see the restored data. This ensures the database is correctly reloaded.

---

## Support
If you encounter issues (e.g., "Permission denied" errors):
1.  Ensure you have read/write access to the folder where you installed the app.
2.  If printing fails, the system defaults to "Save as PDF", allowing you to print the file later.

*Generated for MotorMods Client*
