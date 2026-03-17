export const metadata = {
  title: "Agent & Supervisor Guide - SalesCRM",
  description: "SalesCRM Agent and Supervisor user guide.",
};

export default function AgentGuidePage() {
  return (
    <div className="fixed inset-0 w-full h-full bg-gray-100">
      <iframe
        src="/api/docs/SalesCRM_Agent_Supervisor_Guide.pdf"
        className="w-full h-full border-0"
        title="SalesCRM Agent & Supervisor Guide"
      />
    </div>
  );
}
