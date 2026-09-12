/**
 * SmartAttend Unified Fullstack API Client
 *
 * Connects Next.js frontend with the Express + Prisma REST API backend.
 * Features:
 * - Direct or Next.js proxy routing (/api/backend/*)
 * - Automatic Authorization Bearer header injection
 * - Built-in fallback to mock data when backend or database is offline
 */

export interface BackendHealth {
  status: 'OK' | 'DOWN';
  message: string;
  uptime?: number;
  databaseConfigured?: boolean;
  timestamp?: string;
  isFallback?: boolean;
}


export interface StudentRecord {
  id: number | string;
  name: string;
  usn: string;
  department: string;
  semester: number;
  section: string;
  Lab?: string;
  lab?: string;
  academicYear: string;
  email?: string;
  deviceBound: boolean;
  boundDeviceName?: string | null;
  account?: string;
}

export interface CreateStudentPayload {
  name: string;
  email: string;
  registerNumber: string;
  department?: string;
  departmentId?: number;
  semester: number;
  section: string;
  academicYear?: string;
}

export interface DepartmentRecord {
  id: number;
  name: string;
  code: string;
}

export interface FacultyRecord {
  id: number | string;
  name: string;
  email: string;
  employeeId: string;
  department: string;
  departmentCode?: string;
  designation?: string | null;
  status?: string;
}

// Client or Server base URL determination
const getApiBase = () => {
  if (typeof window !== 'undefined') {
    // Browser side: use Next.js proxy rewrite to avoid CORS and port mismatches
    return '/api/backend';
  }
  return process.env.BACKEND_INTERNAL_URL 
    ? `${process.env.BACKEND_INTERNAL_URL}/api`
    : 'http://localhost:5001/api';
};

/**
 * Health check to verify if backend is reachable
 */
export async function checkBackendHealth(): Promise<BackendHealth> {
  try {
    const res = await fetch(`${getApiBase()}/health`, {
      method: 'GET',
      headers: { 'Accept': 'application/json' },
      signal: AbortSignal.timeout(3000),
    });

    if (res.ok) {
      const data = await res.json();
      return {
        status: 'OK',
        message: data.message || 'API Connected',
        uptime: data.uptime,
        databaseConfigured: data.databaseConfigured,
        timestamp: data.timestamp,
        isFallback: false,
      };
    }
  } catch (e) {
    // Backend unreachable
  }

  return {
    status: 'DOWN',
    message: 'Backend API is currently offline',
    isFallback: false,
  };
}

/**
 * Fetch all students
 */
/**
 * Fetch students from backend (with HOD department restriction & search support)
 */
export async function getStudents(
  searchQuery?: string,
  token?: string
): Promise<{ students: StudentRecord[]; isLive: boolean; isHod?: boolean; department?: string | null }> {
  try {
    const headers: Record<string, string> = { 'Accept': 'application/json' };
    if (token) headers['Authorization'] = `Bearer ${token}`;

    const queryStr = searchQuery ? `?search=${encodeURIComponent(searchQuery)}` : '';
    // Prefer the Next.js session-aware proxy in browser
    const endpoint = typeof window !== 'undefined'
      ? `/api/admin/students${queryStr}`
      : `${getApiBase()}/admin/students${queryStr}`;

    const res = await fetch(endpoint, {
      method: 'GET',
      headers,
      credentials: 'include',
      signal: AbortSignal.timeout(8000),
    });

    if (res.status === 401 && typeof window !== 'undefined') {
      window.location.assign('/admin/login');
      throw new Error('Authentication session is no longer valid');
    }

    if (res.ok) {
      const json = await res.json();
      if (json.success && Array.isArray(json.data)) {
        return {
          students: json.data.map((s: any) => ({
            id: s.id,
            name: s.name,
            usn: s.usn || s.registerNumber,
            department: s.department,
            semester: s.semester,
            section: s.section,
            Lab: s.Lab || s.lab || `${s.section || 'A'}1`,
            lab: s.Lab || s.lab || `${s.section || 'A'}1`,
            academicYear: s.academicYear,
            email: s.email,
            deviceBound: s.deviceBound,
            boundDeviceName: s.boundDeviceName,
            account: s.account || (s.isActive === false ? 'Inactive' : 'Active'),
          })),
          isLive: true,
          isHod: json.isHod,
          department: json.department,
        };
      }
    }
    const failed = await res.json().catch(() => ({}));
    throw new Error(failed.message || 'Failed to load students');
  } catch (err) {
    throw err instanceof Error ? err : new Error('Failed to load students');
  }
}

/**
 * Create a new student via the backend
 */
export async function createStudent(payload: CreateStudentPayload, token?: string) {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'Accept': 'application/json',
  };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const endpoint = typeof window !== 'undefined'
    ? '/api/admin/students'
    : `${getApiBase()}/admin/students`;

  const res = await fetch(endpoint, {
    method: 'POST',
    headers,
    credentials: 'include',
    body: JSON.stringify(payload),
  });

  const json = await res.json();
  if (!res.ok) {
    throw new Error(json.message || 'Failed to create student');
  }
  return json;
}

/**
 * Fetch departments
 */
export async function getDepartments(): Promise<DepartmentRecord[]> {
  try {
    const endpoint = typeof window !== 'undefined'
      ? '/api/admin/departments'
      : `${getApiBase()}/admin/departments`;
    const res = await fetch(endpoint, {
      method: 'GET',
      headers: { 'Accept': 'application/json' },
      credentials: 'include',
      signal: AbortSignal.timeout(4000),
    });

    if (res.ok) {
      const json = await res.json();
      if (json.success && Array.isArray(json.data)) {
        return json.data;
      }
    }
  } catch (err) {}

  throw new Error('Failed to load departments');
}

/**
 * Fetch faculty
 */
export async function getFaculty(
  token?: string,
  options?: { department?: string; filter?: string; search?: string }
): Promise<{ faculty: FacultyRecord[]; isLive: boolean; isHod?: boolean; department?: string | null }> {
  try {
    const params = new URLSearchParams();
    if (options?.department) params.append('department', options.department);
    if (options?.filter) params.append('filter', options.filter);
    if (options?.search) params.append('search', options.search);

    const queryStr = params.toString() ? `?${params.toString()}` : '';
    const headers: Record<string, string> = { 'Accept': 'application/json' };
    if (token) headers['Authorization'] = `Bearer ${token}`;

    const endpoint = typeof window !== 'undefined'
      ? `/api/admin/faculty${queryStr}`
      : `${getApiBase()}/admin/faculty${queryStr}`;

    const res = await fetch(endpoint, {
      method: 'GET',
      headers,
      credentials: 'include',
      signal: AbortSignal.timeout(8000),
    });

    if (res.ok) {
      const json = await res.json();
      if (json.success && Array.isArray(json.data)) {
        return {
          faculty: json.data.map((f: any) => ({
            id: f.id,
            name: f.name || f.user?.name || 'Faculty Member',
            email: f.email || f.user?.email || '',
            employeeId: f.employeeId || `FAC-${f.id}`,
            department: typeof f.department === 'string' ? f.department : f.department?.name || 'Academic Dept',
            departmentCode: f.departmentCode || f.department?.code || '',
            designation: f.designation || null,
            status: f.status || (f.isActive === false ? 'Inactive' : 'Active'),
          })),
          isLive: true,
          isHod: json.isHod,
          department: json.department,
        };
      }
    }
    const failed = await res.json().catch(() => ({}));
    throw new Error(failed.message || 'Failed to load faculty');
  } catch (err) {
    throw err instanceof Error ? err : new Error('Failed to load faculty');
  }
}

export interface ImportStudentItem {
  usn: string;
  name: string;
  year: number;
  department: string;
  status: 'READY' | 'ALREADY_EXISTS' | 'DUPLICATE_IN_FILE' | 'INVALID';
  reason?: string | null;
}

export interface ImportPreviewResult {
  success: boolean;
  preview: boolean;
  department: string;
  departmentName?: string;
  year: number;
  totalFound: number;
  readyToImport: number;
  alreadyExists: number;
  duplicatesInFile: number;
  invalidRows: number;
  students: ImportStudentItem[];
  message?: string;
}

export interface ImportCommitResult {
  success: boolean;
  preview: boolean;
  message: string;
  summary: {
    imported: number;
    skipped: number;
    alreadyExists: number;
    duplicatesInFile: number;
    invalidRows: number;
    totalFound: number;
    department: string;
    year: number;
  };
  data?: any[];
}

/**
 * Preview student list from uploaded file without saving to database
 */
export async function previewImportStudents(file: File, year: number): Promise<ImportPreviewResult> {
  const formData = new FormData();
  formData.append('file', file);
  formData.append('year', String(year));

  const res = await fetch('/api/admin/students/import?preview=true', {
    method: 'POST',
    credentials: 'include',
    body: formData,
  });

  const data = await res.json();
  if (!res.ok || !data.success) {
    throw new Error(data.message || 'Failed to preview student import file');
  }

  return data;
}

/**
 * Commit import of validated students into database
 */
export async function commitImportStudents(file: File, year: number): Promise<ImportCommitResult> {
  const formData = new FormData();
  formData.append('file', file);
  formData.append('year', String(year));

  const res = await fetch('/api/admin/students/import?preview=false', {
    method: 'POST',
    credentials: 'include',
    body: formData,
  });

  const data = await res.json();
  if (!res.ok || !data.success) {
    throw new Error(data.message || 'Failed to import students');
  }

  return data;
}

export interface AssignDivisionPayload {
  startUsn: string;
  endUsn: string;
  division: string;
}

export interface AssignDivisionPreviewResult {
  success: boolean;
  preview: boolean;
  startUsn: string;
  endUsn: string;
  division: string;
  department: string;
  departmentName?: string;
  affectedCount: number;
  students: Array<{
    id: number | string;
    usn: string;
    name: string;
    currentDivision: string;
    newDivision: string;
    semester?: number;
  }>;
}

export interface AssignDivisionCommitResult {
  success: boolean;
  preview: boolean;
  message: string;
  updatedCount: number;
  division: string;
  department: string;
  students?: Array<{
    id: number | string;
    usn: string;
    name: string;
    division: string;
  }>;
}

/**
 * Preview students affected by USN range division assignment
 */
export async function previewAssignDivision(payload: AssignDivisionPayload): Promise<AssignDivisionPreviewResult> {
  const res = await fetch('/api/admin/students/division?preview=true', {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    },
    credentials: 'include',
    body: JSON.stringify(payload),
  });

  const data = await res.json();
  if (!res.ok || !data.success) {
    throw new Error(data.message || 'Failed to calculate affected students');
  }

  return data;
}

/**
 * Commit division assignment to database for USN range
 */
export async function commitAssignDivision(payload: AssignDivisionPayload): Promise<AssignDivisionCommitResult> {
  const res = await fetch('/api/admin/students/division', {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    },
    credentials: 'include',
    body: JSON.stringify(payload),
  });

  const data = await res.json();
  if (!res.ok || !data.success) {
    throw new Error(data.message || 'Failed to assign division to students');
  }

  return data;
}

export interface AssignLabBatchPayload {
  startUsn: string;
  endUsn: string;
  labBatch: string;
}

export interface AssignLabBatchPreviewResult {
  success: boolean;
  preview: boolean;
  canApply: boolean;
  startUsn: string;
  endUsn: string;
  labBatch: string;
  division: string;
  department: string;
  departmentName?: string;
  affectedCount: number;
  alreadyAssignedCount: number;
  reassignedCount: number;
  existingBreakdown: Record<string, number>;
  hasMismatch: boolean;
  mismatchedCount: number;
  mismatchedStudents: Array<{
    id: number | string;
    usn: string;
    name: string;
    section: string;
    currentLab: string;
    semester?: number;
  }>;
  mismatchMessage?: string | null;
  students: Array<{
    id: number | string;
    usn: string;
    name: string;
    division: string;
    currentLab: string;
    newLab: string;
    isMismatched: boolean;
    semester?: number;
  }>;
}

export interface AssignLabBatchCommitResult {
  success: boolean;
  preview: boolean;
  message: string;
  updatedCount: number;
  labBatch: string;
  division: string;
  startUsn: string;
  endUsn: string;
  department: string;
  students?: Array<{
    id: number | string;
    usn: string;
    name: string;
    division: string;
    currentLab: string;
    newLab: string;
    isMismatched: boolean;
    semester?: number;
  }>;
}

/**
 * Preview students affected by USN range lab batch assignment
 */
export async function previewAssignLabBatch(payload: AssignLabBatchPayload): Promise<AssignLabBatchPreviewResult> {
  const res = await fetch('/api/admin/students/lab-batch?preview=true', {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    },
    credentials: 'include',
    body: JSON.stringify(payload),
  });

  const data = await res.json();
  if (!res.ok || !data.success) {
    throw new Error(data.message || 'Failed to calculate lab batch preview');
  }

  return data;
}

/**
 * Commit lab batch assignment to database for USN range
 */
export async function commitAssignLabBatch(payload: AssignLabBatchPayload): Promise<AssignLabBatchCommitResult> {
  const res = await fetch('/api/admin/students/lab-batch', {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    },
    credentials: 'include',
    body: JSON.stringify(payload),
  });

  const data = await res.json();
  if (!res.ok || !data.success) {
    throw new Error(data.message || 'Failed to assign lab batch to students');
  }

  return data;
}


/**
 * Update student editable fields (name, deviceStatus)
 */
export async function updateStudentAdmin(
  id: number | string,
  payload: { name?: string; deviceStatus?: string }
): Promise<{ success: boolean; message: string; data?: any }> {
  const res = await fetch(`/api/admin/students/${id}`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    },
    credentials: 'include',
    body: JSON.stringify(payload),
  });

  const data = await res.json();
  if (!res.ok || !data.success) {
    throw new Error(data.message || 'Failed to update student');
  }

  return data;
}

/**
 * Delete student (blocked if attendance records exist)
 */
export async function deleteStudentAdmin(
  id: number | string
): Promise<{ success: boolean; message: string }> {
  const res = await fetch(`/api/admin/students/${id}`, {
    method: 'DELETE',
    headers: {
      'Accept': 'application/json',
    },
    credentials: 'include',
  });

  const data = await res.json();
  if (!res.ok || !data.success) {
    throw new Error(data.message || 'Failed to delete student');
  }

  return data;
}

export interface StudentDeviceDetail {
  studentId: number;
  usn: string;
  studentName: string;
  department: string;
  isBound: boolean;
  devices: Array<{
    id: number;
    publicKeyFingerprint: string;
    isActive: boolean;
    createdAt: string;
    updatedAt: string;
  }>;
}

/**
 * Get device binding details for a student
 */
export async function getStudentDeviceAdmin(
  id: number | string
): Promise<StudentDeviceDetail> {
  const res = await fetch(`/api/admin/students/${id}/device`, {
    method: 'GET',
    headers: {
      'Accept': 'application/json',
    },
    credentials: 'include',
  });

  const data = await res.json();
  if (!res.ok || !data.success) {
    throw new Error(data.message || 'Failed to fetch student device details');
  }

  return data.data;
}

/**
 * Reset/Unbind student device binding
 */
export async function resetStudentDeviceAdmin(
  id: number | string
): Promise<{ success: boolean; message: string }> {
  const res = await fetch(`/api/admin/students/${id}/device/reset`, {
    method: 'POST',
    headers: {
      'Accept': 'application/json',
    },
    credentials: 'include',
  });

  const data = await res.json();
  if (!res.ok || !data.success) {
    throw new Error(data.message || 'Failed to reset student device binding');
  }

  return data;
}

/**
 * Admin: Add Faculty manually
 */
export async function createFacultyAdmin(payload: {
  name: string;
  employeeId: string;
  department?: string;
  departmentId?: number;
  designation: string;
  email?: string;
  password?: string;
}): Promise<{ success: boolean; message: string; data?: any; faculty?: any }> {
  const res = await fetch('/api/admin/faculty', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    },
    credentials: 'include',
    body: JSON.stringify(payload),
  });

  const data = await res.json();
  if (!res.ok || !data.success) {
    throw new Error(data.message || 'Failed to add faculty member');
  }

  return data;
}

/**
 * Admin: Update Faculty
 */
export async function updateFacultyAdmin(
  id: number | string,
  payload: {
    name?: string;
    employeeId?: string;
    department?: string;
    departmentId?: number;
    designation?: string;
  }
): Promise<{ success: boolean; message: string; data?: any }> {
  const res = await fetch(`/api/admin/faculty/${id}`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    },
    credentials: 'include',
    body: JSON.stringify(payload),
  });

  const data = await res.json();
  if (!res.ok || !data.success) {
    throw new Error(data.message || 'Failed to update faculty member');
  }

  return data;
}

/**
 * Admin: Delete Faculty
 */
export async function deleteFacultyAdmin(
  id: number | string
): Promise<{ success: boolean; message: string }> {
  const res = await fetch(`/api/admin/faculty/${id}`, {
    method: 'DELETE',
    headers: {
      'Accept': 'application/json',
    },
    credentials: 'include',
  });

  const data = await res.json();
  if (!res.ok || !data.success) {
    throw new Error(data.message || 'Failed to delete faculty member');
  }

  return data;
}

/**
 * Download Faculty export in PDF, XLS, or XLSX
 */
export async function downloadFacultyExport(options: {
  format: 'pdf' | 'xls' | 'xlsx';
  department?: string;
  filter?: string;
  search?: string;
}): Promise<void> {
  const params = new URLSearchParams();
  params.append('format', options.format);
  if (options.department) params.append('department', options.department);
  if (options.filter) params.append('filter', options.filter);
  if (options.search) params.append('search', options.search);

  const res = await fetch(`/api/admin/faculty/export?${params.toString()}`, { credentials: 'include' });
  if (!res.ok) {
    const errText = await res.text();
    throw new Error(errText || 'Failed to export faculty records');
  }

  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `faculty_${options.filter || options.department || 'all'}_${new Date().toISOString().split('T')[0]}.${options.format}`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * Download Student export in PDF, XLS, or XLSX
 */
export async function downloadStudentsExport(options: {
  format: 'pdf' | 'xls' | 'xlsx';
  department?: string;
  section?: string;
  lab?: string;
  search?: string;
}): Promise<void> {
  const params = new URLSearchParams();
  params.append('format', options.format);
  if (options.department) params.append('department', options.department);
  if (options.section) params.append('section', options.section);
  if (options.lab) params.append('lab', options.lab);
  if (options.search) params.append('search', options.search);

  const res = await fetch(`/api/admin/students/export?${params.toString()}`, { credentials: 'include' });
  if (!res.ok) {
    const errText = await res.text();
    throw new Error(errText || 'Failed to export student records');
  }

  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `students_${options.department || 'all'}_${new Date().toISOString().split('T')[0]}.${options.format}`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
