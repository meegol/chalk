import { AdminNav } from "@/components/admin-nav";
import { requireStaff } from "@/lib/tenant";

export default async function AdminLayout({ children, params }: LayoutProps<"/g/[slug]/admin">) {
  const { slug } = await params;
  const { gym, staff } = await requireStaff(slug);
  return (
    <div className="flex min-h-dvh flex-col lg:flex-row">
      <AdminNav slug={gym.slug} gymName={gym.name} isOwner={staff.role === "owner"} />
      <main className="w-full flex-1 px-4 pb-28 pt-6 sm:px-6 lg:px-10 lg:pb-12 lg:pt-10">
        <div className="mx-auto max-w-5xl">{children}</div>
      </main>
    </div>
  );
}
