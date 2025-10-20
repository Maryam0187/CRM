import { Suspense } from 'react';
import AddSale from "../../components/AddSale";

export default function AddSalePage() {
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <AddSale />
    </Suspense>
  );
}
