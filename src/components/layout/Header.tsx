export default function Header({ title, description }: { title: string; description?: string }) {
  return <header className="mb-6"><h1 className="text-2xl font-bold">{title}</h1>{description && <p className="mt-2 text-gray-600 dark:text-[#aaaaaa]">{description}</p>}</header>;
}
