export interface DefenseSession {
  id: number;
  groupId: string;
  location: string;
  defenseDate: string;
  startTime: string;
  endTime: string;
  status: string;
  councilId: number;
}

// Người tham gia phiên bảo vệ (giảng viên + sinh viên)
// Backend trả về UserReadDto với: Id, FullName, Email, Role
export interface DefenseSessionUser {
  id?: string; // Backend: Id
  userId?: string; // Alias cho id
  fullName?: string; // Backend: FullName
  FullName?: string; // Backend field name
  email?: string; // Backend: Email
  Email?: string; // Backend field name
  role?: string; // Backend: Role (role name trong hội đồng hoặc "Student")
  Role?: string; // Backend field name
  roleName?: string; // Alias cho role
  roleType?: string; // "Student" hoặc council role (Chair, Secretary, Member)
  studentCode?: string;
  [key: string]: any;
}

// Nhóm & đề tài
// Backend trả về GroupReadDto với: Id, ProjectCode, TopicTitle_EN, TopicTitle_VN, ...
export interface Group {
  id?: string; // Backend: Id
  Id?: string; // Backend field name
  projectCode?: string; // Backend: ProjectCode
  ProjectCode?: string; // Backend field name
  topicTitle_EN?: string; // Backend: TopicTitle_EN
  TopicTitle_EN?: string; // Backend field name
  topicTitle_VN?: string; // Backend: TopicTitle_VN
  TopicTitle_VN?: string; // Backend field name
  name?: string; // Alias
  projectTitle?: string; // Alias cho TopicTitle_EN hoặc TopicTitle_VN
  [key: string]: any;
}

