export default function DashboardLoading() {
  return <div className="mx-auto max-w-[1380px] animate-pulse"><div className="h-10 w-80 rounded-xl bg-[#e4ebe7]" /><div className="mt-7 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{Array.from({ length: 4 }, (_, index) => <div key={index} className="h-44 rounded-[22px] bg-[#e9eeeb]" />)}</div><div className="mt-5 grid gap-5 xl:grid-cols-2"><div className="h-80 rounded-[24px] bg-[#e9eeeb]" /><div className="h-80 rounded-[24px] bg-[#dbe4df]" /></div></div>;
}

