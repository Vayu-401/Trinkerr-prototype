import { lazy, Suspense } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import { GuestOnly, RequireAdmin, RequireAuth, RequireVerified } from "./auth/guards";
import Layout from "./components/Layout";
import { Loading } from "./components/ui";
import { LoginPage, RegisterPage } from "./pages/AuthPages";
import FeedPage from "./pages/FeedPage";
import { EditSurveyPage, MySurveysPage, NewSurveyPage, SurveyListPage } from "./pages/SurveyPages";
import VerificationPage from "./pages/VerificationPage";

// Chart-heavy and admin-only pages load on demand, so Recharts isn't in the first download.
const ResultsPage = lazy(() => import("./pages/TakeSurveyPages").then((m) => ({ default: m.ResultsPage })));
const TakeSurveyPage = lazy(() => import("./pages/TakeSurveyPages").then((m) => ({ default: m.TakeSurveyPage })));
const DashboardPage = lazy(() => import("./pages/DashboardPages").then((m) => ({ default: m.DashboardPage })));
const SharedDashboardPage = lazy(() =>
  import("./pages/DashboardPages").then((m) => ({ default: m.SharedDashboardPage })),
);
const AdminInvestorsPage = lazy(() => import("./pages/AdminPages").then((m) => ({ default: m.AdminInvestorsPage })));
const AdminInvestorDetailPage = lazy(() =>
  import("./pages/AdminPages").then((m) => ({ default: m.AdminInvestorDetailPage })),
);

export default function App() {
  return (
    <Suspense fallback={<Loading />}>
      <Routes>
        <Route path="/login" element={<GuestOnly><LoginPage /></GuestOnly>} />
        <Route path="/register" element={<GuestOnly><RegisterPage /></GuestOnly>} />
        <Route path="/shared/:token" element={<SharedDashboardPage />} />

        <Route element={<RequireAuth><Layout /></RequireAuth>}>
          <Route path="/verification" element={<VerificationPage />} />
          <Route path="/" element={<RequireVerified><FeedPage /></RequireVerified>} />
          <Route path="/posts" element={<RequireVerified><FeedPage /></RequireVerified>} />
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
    </Suspense>
  );
}
