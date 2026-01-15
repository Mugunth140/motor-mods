import { getDb } from "./index";

export const seedService = {
    seedHugeData: async (progressCallback?: (msg: string) => void) => {
        const db = await getDb();

        const genId = (prefix: string) => `${prefix}-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
        const randomInt = (min: number, max: number) => Math.floor(Math.random() * (max - min + 1)) + min;
        const randomItem = <T>(arr: T[]): T => arr[Math.floor(Math.random() * arr.length)];

        // ==========================================
        // 1. PRODUCTS (Target: ~500)
        // ==========================================
        progressCallback?.("Generating 500+ products...");

        const categories = [
            'Brake Parts', 'Engine Parts', 'Suspension', 'Electrical', 'Filters',
            'Transmission', 'Body Parts', 'Interior', 'Wheels & Tires', 'Fluids',
            'Exhaust', 'Cooling System', 'Fuel System', 'Ignition', 'Steering'
        ];

        const prefixes = ['Premium', 'Standard', 'Heavy Duty', 'Racing', 'Eco', 'OEM', 'Performance', 'Budget'];
        const baseNames = [
            'Brake Pad', 'Oil Filter', 'Spark Plug', 'Shock Absorber', 'Alternator',
            'Radiator', 'Clutch Kit', 'Headlight', 'Battery', 'Wiper Blade',
            'Timing Belt', 'Water Pump', 'Fuel Pump', 'Oxygen Sensor', 'Control Arm',
            'Wheel Bearing', 'Gasket Set', 'Piston Ring', 'Starter Motor', 'Thermostat'
        ];

        const productIds: string[] = [];

        // Simpler loop for guaranteed count
        for (let i = 0; i < 500; i++) {
            const category = randomItem(categories);
            const prefix = randomItem(prefixes);
            const base = randomItem(baseNames);
            const name = `${prefix} ${base} - v${randomInt(1, 9)}`;

            const basePrice = randomInt(100, 5000);
            const price = basePrice + randomInt(0, 500); // Varied price
            const costPrice = Math.floor(price * 0.65);
            const quantity = randomInt(0, 150); // Some out of stock
            const reorderLevel = randomInt(5, 20);

            const id = genId('PROD');
            const sku = `SKU-${category.substring(0, 3).toUpperCase()}-${String(i + 1).padStart(4, '0')}`;
            const barcode = `88${String(1000000 + i).padStart(10, '0')}`;

            // FSN Logic simulation: fast moving if ID is even (just to mix it up)
            const fsn = i % 3 === 0 ? 'F' : (i % 3 === 1 ? 'S' : 'N');

            await db.execute(
                `INSERT INTO products (id, name, category, price, purchase_price, quantity, reorder_level, barcode, sku, fsn_classification, created_at) 
                 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, datetime('now'))`,
                [id, name, category, price, costPrice, quantity, reorderLevel, barcode, sku, fsn]
            );
            productIds.push(id);
        }

        // ==========================================
        // 2. INVOICES (Target: ~2000)
        // ==========================================
        progressCallback?.("Generating 2,000 invoices (this may take a moment)...");

        const customers = [
            'Walking Customer', 'Raj Motors', 'ABC Garage', 'Quick Fix Auto', 'Premier Service',
            'City Taxi Co', 'Uber Fleet', 'Zoom Cars', 'Speedy Repairs', 'Local Mechanic',
            'John Doe', 'Jane Smith', 'Mike Ross', 'Harvey Specter', 'Louis Litt'
        ];

        const invoiceIds: string[] = [];
        const itemsToReturn: { invoiceId: string, productId: string, price: number, qty: number }[] = [];

        // Batch size for performance? SQLite handles single inserts okay for 2000, but let's be patient.
        for (let i = 0; i < 2000; i++) {
            const invoiceId = genId('INV');
            const customer = randomItem(customers);

            // Random date within last 365 days
            const daysAgo = randomInt(0, 365);
            const date = new Date();
            date.setDate(date.getDate() - daysAgo);
            // Add random time
            date.setHours(randomInt(9, 19), randomInt(0, 59), 0);
            const invoiceDate = date.toISOString();

            // 1 to 5 items per invoice
            const itemCount = randomInt(1, 5);
            const selectedProducts = [];
            for (let j = 0; j < itemCount; j++) {
                selectedProducts.push(randomItem(productIds));
            }

            let totalAmount = 0;
            const invoiceItems = [];

            for (const prodId of selectedProducts) {
                // Fetch price (mocking fetch to avoid 6000 queries - wait, we need price. 
                // Optimization: We know ids. But for simplicity let's just query or cache product prices?
                // Caching 500 products is cheap.
                const row = await db.select<{ price: number, purchase_price: number }[]>("SELECT price, purchase_price FROM products WHERE id = $1", [prodId]);
                if (row.length === 0) continue;

                const p = row[0];
                const qty = randomInt(1, 4);
                const price = p.price;
                const cost = p.purchase_price;

                totalAmount += price * qty;
                invoiceItems.push({ productId: prodId, qty, price, cost });
            }

            if (invoiceItems.length === 0) continue; // Skip empty

            await db.execute(
                `INSERT INTO invoices (id, customer_name, discount_amount, total_amount, created_at, is_return) 
                 VALUES ($1, $2, 0, $3, $4, 0)`,
                [invoiceId, customer, totalAmount, invoiceDate]
            );
            invoiceIds.push(invoiceId);

            for (const item of invoiceItems) {
                const itemId = genId('ITEM');
                await db.execute(
                    `INSERT INTO invoice_items (id, invoice_id, product_id, quantity, price, cost_price) 
                     VALUES ($1, $2, $3, $4, $5, $6)`,
                    [itemId, invoiceId, item.productId, item.qty, item.price, item.cost]
                );
            }

            // Save candidate for return (5% chance)
            if (Math.random() < 0.05) {
                itemsToReturn.push({
                    invoiceId,
                    productId: invoiceItems[0].productId,
                    price: invoiceItems[0].price,
                    qty: 1
                });
            }

            if (i % 100 === 0) progressCallback?.(`Generated ${i} / 2000 invoices...`);
        }

        // ==========================================
        // 3. RETURNS (Target: from samples)
        // ==========================================
        progressCallback?.(`Generating ${itemsToReturn.length} returns...`);

        for (const item of itemsToReturn) {
            const returnId = genId('RET');
            const returnNo = `RET-${String(Date.now()).slice(-8)}-${randomInt(100, 999)}`;
            const reason = randomItem(['defective', 'wrong_item', 'customer_request', 'other']);

            await db.execute(
                `INSERT INTO sales_returns (id, return_no, invoice_id, return_date, reason, total_amount, notes, status, created_at, updated_at) 
                 VALUES ($1, $2, $3, datetime('now'), $4, $5, 'Seeded return', 'completed', datetime('now'), datetime('now'))`,
                [returnId, returnNo, item.invoiceId, reason, item.price]
            );

            await db.execute(
                `INSERT INTO return_items (id, return_id, product_id, quantity, rate, line_total) 
                 VALUES ($1, $2, $3, 1, $4, $4)`,
                [genId('RI'), returnId, item.productId, item.price]
            );
            // Update inventory
            await db.execute(
                `UPDATE products SET quantity = quantity + 1 WHERE id = $1`,
                [item.productId]
            );
        }

        progressCallback?.("Huge data seeding complete!");
    }
};
