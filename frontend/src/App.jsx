import { Navigate, Outlet, Route, Routes } from 'react-router-dom';
import { useAuth } from './lib/auth.jsx';
import { Spinner } from './components/ui.jsx';
import Layout from './components/Layout.jsx';
import Login from './pages/Login.jsx';
import Dashboard from './pages/Dashboard.jsx';
import Courses from './pages/Courses.jsx';
import CourseDetail from './pages/CourseDetail.jsx';
import Students from './pages/Students.jsx';
import StudentDetail from './pages/StudentDetail.jsx';
import Enrolments from './pages/Enrolments.jsx';
import EnrolmentDetail from './pages/EnrolmentDetail.jsx';
import Scheduler from './pages/Scheduler.jsx';
import SchedulerDetail from './pages/SchedulerDetail.jsx';

function Splash() {
  return (
    <div className="flex min-h-dvh items-center justify-center bg-paper text-brand-600">
      <Spinner size={28} />
    </div>
  );
}

function Protected() {
  const { session, loading } = useAuth();
  if (loading) return <Splash />;
  if (!session) return <Navigate to="/login" replace />;
  return <Outlet />;
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route element={<Protected />}>
        <Route element={<Layout />}>
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/courses" element={<Courses />} />
          <Route path="/course/:id" element={<CourseDetail />} />
          <Route path="/students" element={<Students />} />
          <Route path="/student/:id" element={<StudentDetail />} />
          <Route path="/enrolments" element={<Enrolments />} />
          <Route path="/enrolment/:id" element={<EnrolmentDetail />} />
          <Route path="/scheduler" element={<Scheduler />} />
          <Route path="/scheduler/:id" element={<SchedulerDetail />} />
        </Route>
      </Route>
      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  );
}
