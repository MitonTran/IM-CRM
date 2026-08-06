export default function TasksLoading() { return <div className="mx-auto max-w-[1200px] animate-pulse"><div className="h-10 w-52 rounded-xl bg-[#dfe8e2]" /><div className="mt-7 grid gap-3 sm:grid-cols-3">{Array.from({ length: 3 }, (_, index) => <div key={index} className="h-32 rounded-2xl bg-white" />)}</div><div className="mt-5 h-96 rounded-[22px] bg-white" /></div>; }

