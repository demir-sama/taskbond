import { JobPage } from "@/components/job-page";

export default async function Page({ params }: PageProps<"/jobs/[id]">) {
  const { id } = await params;
  return <JobPage id={Number(id)} />;
}
