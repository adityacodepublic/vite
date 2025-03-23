import "./header.css";

type HeaderProps = {
  balance?: number;
};

export default function Header({ balance }: HeaderProps) {
  return (
    <div className="header">
      <div className="bankBalance">
        <p>Your Balance</p>
        <h1>&#8377;{balance ?? 28000}</h1>
      </div>
    </div>
  );
}
