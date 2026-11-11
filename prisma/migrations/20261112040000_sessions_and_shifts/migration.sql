-- CreateEnum
CREATE TYPE "OrderState" AS ENUM ('OPEN', 'CHECKOUT', 'PAID');

-- CreateEnum
CREATE TYPE "PaymentMethod" AS ENUM ('PIX', 'CASH', 'CARD');

-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "paymentMethod" "PaymentMethod",
ADD COLUMN     "paymentShiftId" INTEGER,
ADD COLUMN     "shiftId" INTEGER,
ADD COLUMN     "state" "OrderState" NOT NULL DEFAULT 'OPEN';

-- CreateTable
CREATE TABLE "Shift" (
    "id" SERIAL NOT NULL,
    "openKey" INTEGER,
    "openedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closedAt" TIMESTAMP(3),
    "openedBy" INTEGER NOT NULL,
    "closedBy" INTEGER,

    CONSTRAINT "Shift_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Session" (
    "tokenHash" TEXT NOT NULL,
    "userId" INTEGER NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("tokenHash")
);

-- CreateTable
CREATE TABLE "LoginAttempt" (
    "key" TEXT NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "blockedUntil" TIMESTAMP(3),

    CONSTRAINT "LoginAttempt_pkey" PRIMARY KEY ("key")
);

-- CreateIndex
CREATE UNIQUE INDEX "Shift_openKey_key" ON "Shift"("openKey");

-- CreateIndex
CREATE INDEX "Session_expiresAt_idx" ON "Session"("expiresAt");

-- CreateIndex
CREATE INDEX "Order_paymentStatus_paymentShiftId_idx" ON "Order"("paymentStatus", "paymentShiftId");

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_shiftId_fkey" FOREIGN KEY ("shiftId") REFERENCES "Shift"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_paymentShiftId_fkey" FOREIGN KEY ("paymentShiftId") REFERENCES "Shift"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

UPDATE "Order" SET "state" = 'PAID' WHERE "paymentStatus" = 'PAID';

CREATE UNIQUE INDEX "Order_one_unpaid_per_customer"
ON "Order" ("customerId") WHERE "paymentStatus" <> 'PAID';

ALTER TABLE "Shift" ADD CONSTRAINT "Shift_open_key_check"
CHECK (("openKey" = 1 AND "closedAt" IS NULL) OR ("openKey" IS NULL AND "closedAt" IS NOT NULL));
