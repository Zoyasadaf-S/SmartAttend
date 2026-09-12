import { isHod, isSuperAdmin, hasDepartmentAccess, scopedDepartmentId } from '../src/utils/rbac.js';

const hod = { role: 'ADMIN', departmentId: 2 };
const superAdmin = { role: 'SUPER_ADMIN', departmentId: null };

const failures = [];
const assert = (cond, msg) => { if (!cond) failures.push(msg); };

assert(isHod(hod) && !isSuperAdmin(hod), 'HOD role mapping');
assert(isSuperAdmin(superAdmin) && !isHod(superAdmin), 'SUPER_ADMIN role mapping');
assert(hasDepartmentAccess(hod, 2) && !hasDepartmentAccess(hod, 9), 'HOD cannot escape department');
assert(hasDepartmentAccess(superAdmin, 9), 'SUPER_ADMIN institution-wide');
assert(scopedDepartmentId(hod) === 2 && scopedDepartmentId(superAdmin) === null, 'scope source is account department');

if (failures.length) {
  console.error(failures.join('\n'));
  process.exit(1);
}
console.log('RBAC unit checks passed');
