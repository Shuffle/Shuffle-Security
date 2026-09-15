import { WorkflowRunDebugger } from '@/Shuffle-Core';
import { useAuth } from '@/context/AuthContext';
import { useTheme } from '@/context/ThemeContext';

export default function WorkflowRunDebuggerPage() {
  const { userInfo } = useAuth();
  const { theme } = useTheme();

  return (
    <div className="w-full flex-1">
      <WorkflowRunDebugger
        userdata={userInfo}
        theme={theme}
      />
    </div>
  );
}
