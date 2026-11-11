export default function GoalsLoading() {
  return (
    <main className="p-8" aria-busy="true">
      <h1 className="text-xl font-semibold">目标管理</h1>
      <p role="status" className="mt-4 text-slate-600">
        正在加载目标管理…
      </p>
    </main>
  );
}
