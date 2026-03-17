export const metadata = {
  title: "Admin Guide - SalesCRM",
  description: "SalesCRM Admin user guide.",
};

export default function AdminGuidePage() {
  return (
    <div className="fixed inset-0 w-full h-full bg-gray-100">
      <iframe
        src="/docs/SalesCRM_Admin_Guide.pdf"
        className="w-full h-full border-0"
        title="SalesCRM Admin Guide"
      />
    </div>
  );
}
