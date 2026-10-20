export type Role = "admin" | "investor";
export type VerificationStatus = "unverified" | "pending" | "verified" | "rejected";

export interface User {
  id: string;
  email: string;
  name: string;
  role: Role;
  verification_status: VerificationStatus;
  verification_note: string;
}

export interface Paginated<T> {
  count: number;
  next: string | null;
  previous: string | null;
  results: T[];
}

export interface PersonRef {
  id: string;
  name: string;
}

export interface VerificationDocument {
  id: string;
  doc_type: string;
  original_filename: string;
  content_type: string;
  size_bytes: number;
  uploaded_at: string;
  download_url?: string;
}

export interface MyVerification {
  status: VerificationStatus;
  note: string;
  documents: VerificationDocument[];
}

export interface AdminInvestor {
  id: string;
  email: string;
  name: string;
  verification_status: VerificationStatus;
  verification_note: string;
  document_count: number;
  created_at: string;
  verified_at: string | null;
}

export type SurveyStatus = "draft" | "published" | "closed";
export type QuestionType = "single" | "multiple";

export interface SurveyListItem {
  id: string;
  title: string;
  description: string;
  creator: PersonRef;
  status: SurveyStatus;
  published_at: string | null;
  created_at: string;
  question_count: number;
  has_responded: boolean;
}

export interface SurveyDetail extends SurveyListItem {
  questions: {
    id: string;
    text: string;
    type: QuestionType;
    position: number;
    options: { id: string; text: string; position: number }[];
  }[];
}

export interface OptionResult {
  id: string;
  text: string;
  selection_count: number;
  percentage: number;
}

export interface SurveyResults {
  survey_id: string;
  title: string;
  status?: SurveyStatus;
  participant_count: number;
  pending_responses: number;
  stats_updated_at: string | null;
  questions: { id: string; text: string; type: QuestionType; options: OptionResult[] }[];
}

export interface MyResponse {
  id: string;
  survey: { id: string; title: string };
  submitted_at: string;
  processed: boolean;
}

export interface Dashboard {
  owner_name: string;
  surveys_created_count: number;
  surveys_participated_count: number;
  participation_timeline: { month: string; count: number }[];
  created_surveys: SurveyResults[];
  history?: { survey_id: string; title: string; submitted_at: string }[];
  generated_at?: string;
}

export interface DashboardShare {
  id: string;
  token: string;
  url: string;
  expires_at: string | null;
  revoked_at: string | null;
  created_at: string;
  is_active: boolean;
}

export interface Post {
  id: string;
  body: string;
  created_at: string;
  author: PersonRef;
  survey: { id: string; title: string } | null;
  dashboard_url: string | null;
}
