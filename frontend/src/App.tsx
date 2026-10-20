import { Navigate, Route, Routes } from "react-router-dom";
import { GuestOnly, RequireAdmin, RequireAuth, RequireVerified } from "./auth/guards";
import Layout, { PageHeader } from "./components/Layout";
import { AdminInvestorDetailPage, AdminInvestorsPage } from "./pages/AdminPages";
import { LoginPage, RegisterPage } from "./pages/AuthPages";
import VerificationPage from "./pages/VerificationPage";

function ComingSoon({ title }: { title: string }) {
  return <PageHeader title={title} intro="This page arrives in a later build phase." />;
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<GuestOnly><LoginPage /></GuestOnly>} />
      <Route path="/register" element={<GuestOnly><RegisterPage /></GuestOnly>} />

      <Route element={<RequireAuth><Layout /></RequireAuth>}>
        <Route path="/verification" element={<VerificationPage />} />
        <Route path="/" element={<RequireVerified><ComingSoon title="Feed" /></RequireVerified>} />
        <Route path="/admin/investors" element={<RequireAdmin><AdminInvestorsPage /></RequireAdmin>} />
        <Route path="/admin/investors/:id" element={<RequireAdmin><AdminInvestorDetailPage /></RequireAdmin>} />
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
