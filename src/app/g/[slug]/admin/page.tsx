import { PageTitle } from "@/components/ui";
import { requireStaff } from "@/lib/tenant";

export default async function AdminHome({ params }: PageProps<"/g/[slug]/admin">) {
  const { slug } = await params;
  const { gym } = await requireStaff(slug);
  return <PageTitle sub="Today at a glance">{gym.name}</PageTitle>;
}
