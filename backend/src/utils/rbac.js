export const isSuperAdmin = (user) => user?.role === "SUPER_ADMIN";
export const isHod = (user) => user?.role === "ADMIN";
export const isPortalAdmin = (user) => isSuperAdmin(user) || isHod(user);

export const scopedDepartmentId = (user) => {
  if (isHod(user)) {
    return user?.departmentId == null ? null : Number(user.departmentId);
  }
  return null;
};

export const hasDepartmentAccess = (user, departmentId) => {
  if (isSuperAdmin(user)) return true;
  if (!isHod(user)) return false;
  return Number(user.departmentId) === Number(departmentId);
};

export const requireHodDepartment = (user) => {
  if (!isHod(user)) return null;
  const departmentId = scopedDepartmentId(user);
  if (!departmentId) {
    const error = new Error("HOD account is missing a department assignment");
    error.statusCode = 403;
    throw error;
  }
  return departmentId;
};
