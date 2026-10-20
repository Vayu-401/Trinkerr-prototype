import { Navigate, Route, Routes } from "react-router-dom";
import { GuestOnly, RequireAdmin, RequireAuth, RequireVerified } from "./auth/guards";
import Layout, { PageHeader } from "./components/Layout";
import { AdminInvestorDetailPage, AdminInvestorsPage } from "./pages/AdminPages";
import { LoginPage, RegisterPage } from "./pages/AuthPages";
import { DashboardPage, SharedDashboardPage } from "./pages/DashboardPages";
import { EditSurveyPage, MySurveysPage, NewSurveyPage, SurveyListPage } from "./pages/SurveyPages";
import { ResultsPage, TakeSurveyPage } from "./pages/TakeSurveyPages";
import VerificationPage from "./pages/VerificationPage";

function ComingSoon({ title }: { title: string }) {
  return <PageHeader title={title} intro="This page arrives in a later build phase." />;
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<GuestOnly><LoginPage /></GuestOnly>} />
      <Route path="/register" element={<GuestOnly><RegisterPage /></GuestOnly>} />
      <Route path="/shared/:token" element={<SharedDashboardPage />} />

      <Route element={<RequireAuth><Layout /></RequireAuth>}>
        <Route path="/verification" element={<VerificationPage />} />
        <Route path="/" element={<RequireVerified><ComingSoon title="Feed" /></RequireVerified>} />
        <Route path="/surveys" element={<RequireVerified><SurveyListPage /></RequireVerified>} />
        <Route path="/surveys/new" element={<RequireVerified><NewSurveyPage /></RequireVerified>} />
        <Route path="/surveys/:id" element={<RequireVerified><TakeSurveyPage /></RequireVerified>} />
        <Route path="/surveys/:id/edit" element={<RequireVerified><EditSurveyPage /></RequireVerified>} />
        <Route path="/surveys/:id/results" element={<RequireVerified><ResultsPage /></RequireVerified>} />
        <Route path="/my/surveys" element={<RequireVerified><MySurveysPage /></RequireVerified>} />
        <Route path="/dashboard" element={<RequireVerified><DashboardPage /></RequireVerified>} />
        <Route path="/admin/investors" element={<RequireAdmin><AdminInvestorsPage /></RequireAdmin>} />
        <Route path="/admin/investors/:id" element={<RequireAdmin><AdminInvestorDetailPage /></RequireAdmin>} />
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
