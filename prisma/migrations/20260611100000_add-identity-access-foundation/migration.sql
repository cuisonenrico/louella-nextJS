-- AlterTable: Add new fields to User
ALTER TABLE "User" ADD COLUMN "isActive" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "User" ADD COLUMN "mustChangePassword" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "User" ADD COLUMN "createdById" INTEGER;
ALTER TABLE "User" ADD COLUMN "branchId" INTEGER;

-- CreateIndex: unique branchId on User
CREATE UNIQUE INDEX "User_branchId_key" ON "User"("branchId");

-- AddForeignKey: User.createdById -> User.id
ALTER TABLE "User" ADD CONSTRAINT "User_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey: User.branchId -> Branch.id
ALTER TABLE "User" ADD CONSTRAINT "User_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- CreateTable: Feature
CREATE TABLE "Feature" (
    "id" SERIAL NOT NULL,
    "key" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Feature_pkey" PRIMARY KEY ("id")
);

-- CreateIndex: unique key on Feature
CREATE UNIQUE INDEX "Feature_key_key" ON "Feature"("key");

-- CreateTable: RoleFeaturePermission
CREATE TABLE "RoleFeaturePermission" (
    "id" SERIAL NOT NULL,
    "role" "UserRole" NOT NULL,
    "featureKey" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "updatedById" INTEGER,

    CONSTRAINT "RoleFeaturePermission_pkey" PRIMARY KEY ("id")
);

-- CreateIndex: unique role+featureKey
CREATE UNIQUE INDEX "RoleFeaturePermission_role_featureKey_key" ON "RoleFeaturePermission"("role", "featureKey");

-- CreateIndex
CREATE INDEX "RoleFeaturePermission_role_idx" ON "RoleFeaturePermission"("role");

-- AddForeignKey: RoleFeaturePermission.featureKey -> Feature.key
ALTER TABLE "RoleFeaturePermission" ADD CONSTRAINT "RoleFeaturePermission_featureKey_fkey" FOREIGN KEY ("featureKey") REFERENCES "Feature"("key") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey: RoleFeaturePermission.updatedById -> User.id
ALTER TABLE "RoleFeaturePermission" ADD CONSTRAINT "RoleFeaturePermission_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- CreateTable: UserFeaturePermission
CREATE TABLE "UserFeaturePermission" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "featureKey" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "updatedById" INTEGER,

    CONSTRAINT "UserFeaturePermission_pkey" PRIMARY KEY ("id")
);

-- CreateIndex: unique userId+featureKey
CREATE UNIQUE INDEX "UserFeaturePermission_userId_featureKey_key" ON "UserFeaturePermission"("userId", "featureKey");

-- CreateIndex
CREATE INDEX "UserFeaturePermission_userId_idx" ON "UserFeaturePermission"("userId");

-- AddForeignKey: UserFeaturePermission.userId -> User.id
ALTER TABLE "UserFeaturePermission" ADD CONSTRAINT "UserFeaturePermission_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey: UserFeaturePermission.featureKey -> Feature.key
ALTER TABLE "UserFeaturePermission" ADD CONSTRAINT "UserFeaturePermission_featureKey_fkey" FOREIGN KEY ("featureKey") REFERENCES "Feature"("key") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey: UserFeaturePermission.updatedById -> User.id
ALTER TABLE "UserFeaturePermission" ADD CONSTRAINT "UserFeaturePermission_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
