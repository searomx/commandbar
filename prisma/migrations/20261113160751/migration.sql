/*
  Warnings:

  - You are about to alter the column `logoMarca` on the `Licensed` table. The data in that column could be lost. The data in that column will be cast from `VarChar(255)` to `VarChar(150)`.

*/
-- AlterTable
ALTER TABLE "Licensed" ALTER COLUMN "logoMarca" SET DATA TYPE VARCHAR(150);
