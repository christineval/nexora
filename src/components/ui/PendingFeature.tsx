import Card from "@/components/ui/Card";
export default function PendingFeature({ feature }: { feature: string }) {
  return <Card><p className="font-medium">{feature} is not available yet.</p><p className="mt-2 text-sm text-gray-500 dark:text-[#aaaaaa]">This module is planned. No business records are displayed or changed.</p></Card>;
}
