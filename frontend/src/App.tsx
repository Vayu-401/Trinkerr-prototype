import { Navigate, Route, Routes } from "react-router-dom";
import { GuestOnly, RequireAdmin, RequireAuth, RequireVerified } from "./auth/guards";
import Layout, { PageHeader } from "./components/Layout";
import { LoginPage, RegisterPage } from "./pages/AuthPages";

function ComingSoon({ title }: { title: string }) {
  return <PageHeader title={title} intro="This page arrives in a later build phase." />;
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<GuestOnly><LoginPage /></GuestOnly>} />
      <Route path="/register" element={<GuestOnly><RegisterPage /></GuestOnly>} />

      <Route element={<RequireAuth><Layout /></RequireAuth>}>
        <Route path="/verification" element={<ComingSoon title="Verification" />} />
        <Route path="/" element={<RequireVerified><ComingSoon title="Feed" /></RequireVerified>} />
        <Route path="/admin/investors" element={<RequireAdmin><ComingSoon title="Investors" /></RequireAdmin>} />
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
