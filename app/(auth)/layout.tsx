export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="min-h-screen flex items-center justify-center p-4 bg-gray-50 dark:bg-[#0a0f1a] transition-colors duration-300"
    >
      {children}
    </div>
  );
}
