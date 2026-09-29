import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { UsersService } from '../users/users.service';
import { recordChanges } from '../common/utils/audit.util';
import { EmployeesService } from './employees.service';
import { CreateEmployeeAccountDto } from './dto/account.dto';

/**
 * An employee's optional login. The User table is untouched by payroll: this
 * only creates a user through the normal admin path and records the link.
 */
@Injectable()
export class EmployeeAccountsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly users: UsersService,
    private readonly employees: EmployeesService,
  ) {}

  async create(employeeId: number, dto: CreateEmployeeAccountDto, adminId: number) {
    const employee = await this.employees.requireEmployee(employeeId);
    if (employee.userId !== null) throw new ConflictException('This employee already has a login');

    const user = await this.users.createByAdmin(
      { email: dto.email, password: dto.password, role: dto.role, branchId: dto.branchId, mustChangePassword: true },
      adminId,
    );
    try {
      await this.attach(employeeId, user.id, adminId);
    } catch (err) {
      // The login was created by its own service and transaction. If the link
      // fails (another admin linked one meanwhile), disable it rather than
      // leave a working login attached to nobody.
      await this.users.setActive(user.id, false, adminId);
      throw err;
    }
    return { userId: user.id, email: user.email, role: user.role, isActive: user.isActive };
  }

  async link(employeeId: number, userId: number, adminId: number) {
    const employee = await this.employees.requireEmployee(employeeId);
    if (employee.userId !== null) throw new ConflictException('This employee already has a login');

    const user = await this.users.findByIdSafe(userId);
    if (!user) throw new NotFoundException('Login not found');

    const holder = await this.prisma.employee.findFirst({ where: { userId, deletedAt: null } });
    if (holder) {
      throw new ConflictException(`That login already belongs to ${holder.firstName} ${holder.lastName}`);
    }
    await this.attach(employeeId, userId, adminId);
    return { userId: user.id, email: user.email, role: user.role, isActive: user.isActive };
  }

  async deactivate(employeeId: number, adminId: number) {
    const employee = await this.employees.requireEmployee(employeeId);
    if (employee.userId === null || employee.user === null) {
      throw new BadRequestException('This employee has no login');
    }
    await this.users.setActive(employee.userId, false, adminId);
    return { userId: employee.userId, email: employee.user.email, role: employee.user.role, isActive: false };
  }

  /**
   * Link in one transaction, and only if the employee still has no login: two
   * admins linking at once used to both pass the check above and the second
   * silently replaced the first.
   */
  private attach(employeeId: number, userId: number, adminId: number) {
    return this.prisma.$transaction(async (tx) => {
      const linked = await tx.employee.updateMany({
        where: { id: employeeId, userId: null, deletedAt: null },
        data: { userId },
      });
      if (linked.count !== 1) throw new ConflictException('This employee already has a login');
      await recordChanges(
        tx,
        [{ entity: 'Employee', entityId: employeeId, before: { userId: null }, after: { userId }, action: 'update' }],
        adminId,
      );
    });
  }
}
