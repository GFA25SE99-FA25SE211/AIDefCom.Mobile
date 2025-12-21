export interface DefenseSession {
  id: number;
  groupId: string;
  location: string;
  defenseDate: string;
  startTime: string;
  endTime: string;
  status: string;
  councilId: number;
  topicTitle_VN?: string;
  topicTitle_EN?: string;
  TopicTitle_VN?: string;
  TopicTitle_EN?: string;
  projectCode?: string;
  ProjectCode?: string;
}

export interface DefenseSessionUser {
  id?: string;
  userId?: string;
  fullName?: string;
  FullName?: string;
  email?: string;
  Email?: string;
  role?: string;
  Role?: string;
  roleName?: string;
  roleType?: string;
  studentCode?: string;
  [key: string]: any;
}


export interface Group {
  id?: string;
  Id?: string;
  projectCode?: string;
  ProjectCode?: string;
  topicTitle_EN?: string;
  TopicTitle_EN?: string;
  topicTitle_VN?: string;
  TopicTitle_VN?: string;
  name?: string;
  projectTitle?: string;
  [key: string]: any;
}

