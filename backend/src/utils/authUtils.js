export const isSuperAdmin = (user) => user.role === 'SUPER_ADMIN';
export const isAdmin = (user) => user.role === 'ADMIN';
export const isFaculty = (user) => user.role === 'FACULTY';
export const isStudent = (user) => user.role === 'STUDENT';

export const withinDepartmentScope = (user, resourceDepartmentId) => {
  if (isSuperAdmin(user)) return true;
  if (isAdmin(user)) return user.departmentId === resourceDepartmentId;
  return false;
};
