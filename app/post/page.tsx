import { PostForm } from "@/components/post-form";
import { IntentsPanel } from "@/components/intents-panel";

export const metadata = { title: "Post a job · Taskbond" };

export default function Page() {
  return (
    <div className="mx-auto max-w-7xl px-5 pt-14">
      <div className="eyebrow">Post a research job</div>
      <h1 className="mt-3 max-w-3xl text-4xl font-semibold tracking-tight sm:text-5xl">
        Escrow a bounty. <span className="font-display font-normal italic text-mint">Let the swarm compete.</span>
      </h1>
      <p className="mt-4 max-w-2xl text-mute">Your wallet signs <span className="mono text-soft">create_job</span> on NEAR testnet. The reward is locked in the contract until a reviewed winner is paid, or it refunds to you.</p>
      <div className="mt-10 grid items-start gap-6 lg:grid-cols-[1fr_1.05fr]">
        <PostForm />
        <IntentsPanel />
      </div>
    </div>
  );
}
