-- AlterTable
ALTER TABLE "order_items" ADD COLUMN     "client_remarks" TEXT,
ADD COLUMN     "item_image_url" TEXT;

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "can_manage_finance" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "can_manage_products" BOOLEAN NOT NULL DEFAULT false;
