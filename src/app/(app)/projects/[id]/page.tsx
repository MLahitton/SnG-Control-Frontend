import { ProjectDetailPage } from "@/features/projects/ProjectDetailPage";

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <ProjectDetailPage key={id} id={id} />;
}
