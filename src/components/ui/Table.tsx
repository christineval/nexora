export default function Table({ headers, rows, emptyMessage = "No records to display." }: {
  headers: string[]; rows: { id: string; cells: React.ReactNode[] }[]; emptyMessage?: string;
}) {
  return <div className="overflow-x-auto"><table className="w-full text-left">
    <thead><tr>{headers.map((header) => <th key={header} scope="col" className="border-b border-gray-200 p-3 dark:border-[#303030]">{header}</th>)}</tr></thead>
    <tbody>{rows.length ? rows.map((row) => <tr key={row.id}>{row.cells.map((cell, index) => <td key={index} className="border-b border-gray-200 p-3 dark:border-[#303030]">{cell}</td>)}</tr>) :
      <tr><td colSpan={headers.length} className="p-6 text-gray-500 dark:text-[#aaaaaa]">{emptyMessage}</td></tr>}
    </tbody></table></div>;
}
