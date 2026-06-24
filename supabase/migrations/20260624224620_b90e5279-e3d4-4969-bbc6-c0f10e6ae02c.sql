DELETE FROM product_category_links WHERE product_id IN (SELECT id FROM products WHERE name LIKE 'منتج_فحص_%');
DELETE FROM products WHERE name LIKE 'منتج_فحص_%';
DELETE FROM product_categories WHERE name LIKE 'فئة_فحص_%';
DELETE FROM product_companies WHERE name LIKE 'ماركة_فحص_%';
DELETE FROM customers WHERE name LIKE 'عميل_فحص_%';