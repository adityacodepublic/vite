import {
  AlignEndHorizontal,
  ArrowRightLeft,
  History,
  Landmark,
} from "lucide-react";
import "./buttons.css";

export default function NavButtons() {
  return (
    <div className="btns">
      <div className="button-16">
          <History size={30} />
          <p>History</p>
      </div>
      <div className="button-16">
        <ArrowRightLeft  size={30}/>
        <p>Pay</p>
      </div>
      
      
      <div className="button-16">
        <Landmark size={35} />
        <p>Investment</p>
      </div>
      
      
      <div className="button-16">
        <AlignEndHorizontal  size={35}/>
        <p>Report</p>
      </div>
    </div>
  );
}

