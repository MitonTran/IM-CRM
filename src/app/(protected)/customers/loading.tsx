export default function CustomersLoading() {
  return <div className="mx-auto max-w-[1500px] animate-pulse"><div className="h-10 w-56 rounded-xl bg-[#dfe8e2]" /><div className="mt-3 h-5 w-96 max-w-full rounded-lg bg-[#e6ece8]" /><div className="mt-8 overflow-hidden rounded-[22px] border border-[#dfe7e2] bg-white p-4"><div className="grid gap-3 md:grid-cols-4">{Array.from({ length: 4 }, (_, index) => <div key={index} className="h-11 rounded-xl bg-[#eef2ef]" />)}</div><div className="mt-8 space-y-3">{Array.from({ length: 7 }, (_, index) => <div key={index} className="h-14 rounded-xl bg-[#f1f4f2]" />)}</div></div></div>;
}

