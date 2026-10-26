import { ClientDetailPage } from "@/features/clients/ClientDetailPage";
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <ClientDetailPage id={id} />;
}
