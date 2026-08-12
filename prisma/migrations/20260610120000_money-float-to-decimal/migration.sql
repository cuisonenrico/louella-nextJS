-- AlterTable
ALTER TABLE "Product" ALTER COLUMN "price" TYPE DECIMAL(10,2) USING "price"::DECIMAL(10,2),
ALTER COLUMN "price" SET DEFAULT 0.00;

-- AlterTable
ALTER TABLE "Material" ALTER COLUMN "pricePerUnit" TYPE DECIMAL(10,4) USING "pricePerUnit"::DECIMAL(10,4),
ALTER COLUMN "pricePerUnit" SET DEFAULT 0.0000,
ALTER COLUMN "reorderLevel" TYPE DECIMAL(10,4) USING "reorderLevel"::DECIMAL(10,4),
ALTER COLUMN "reorderLevel" SET DEFAULT 0.0000;

-- AlterTable
ALTER TABLE "MaterialPriceHistory" ALTER COLUMN "pricePerUnit" TYPE DECIMAL(10,4) USING "pricePerUnit"::DECIMAL(10,4);

-- AlterTable
ALTER TABLE "ProductPriceHistory" ALTER COLUMN "price" TYPE DECIMAL(10,2) USING "price"::DECIMAL(10,2);
