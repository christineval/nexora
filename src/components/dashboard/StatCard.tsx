export default function StatCard({ title, value, bgColor, icon, iconColor }: {
  title: string; value: string; bgColor: string; icon: React.ReactNode; iconColor: string;
}) {
  return <div className="bg-white dark:bg-[#191919] border border-gray-200 dark:border-[#303030] rounded-2xl p-5 shadow-sm hover:shadow-md transition-shadow">
    <div className="flex items-start gap-5">
      <div className={`flex shrink-0 items-center justify-center w-12 h-12 rounded-full ${bgColor} dark:bg-[#303030]`}><div className={iconColor}>{icon}</div></div>
      <div><p className="text-xs text-gray-500 dark:text-[#aaaaaa]">{title}</p><h2 className="mt-3 text-3xl font-semibold text-gray-900 dark:text-[#f5f5f5]">{value}</h2></div>
    </div>
  </div>;
}
