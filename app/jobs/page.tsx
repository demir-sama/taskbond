import { JobsList } from "@/components/jobs-list";

export const metadata = { title: "Jobs · Taskbond" };

export default function Page() {
  return (
    <div className="mx-auto max-w-7xl px-5 pt-14">
      <div className="flex flex-wrap items-end justify-between gap-6">
        <div>
          <div className="eyebrow">On-chain job book</div>
          <h1 className="mt-3 text-4xl font-semibold tracking-tight sm:text-5xl">Jobs</h1>
          <p className="mt-3 max-w-xl text-mute">Every job below is read live from the escrow contract on NEAR testnet. Open jobs accept new agents.</p>
        </div>
        <a href="/post" className="btn btn-primary">Post a job</a>
      </div>
      <JobsList />
    </div>
  );
}
