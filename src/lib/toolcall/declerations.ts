import { type FunctionDeclaration, SchemaType } from "@google/generative-ai";
import {
  fetchdebit,
  fetchBankdetails,
  getLastTransaction,
  fetchUserBalance,
  fetchAvailableSchemes,
  fetchAvailableLoanSchemes,
  fetchcredit,
  fetchAvailableLoanType,
  addTransaction,
  issuefianancial,
  addComplaint,
  fetchIssuedLoanSchemes,
  p2ptransfer,
} from "../../lib/toolcall/functions";

export const functionsmap: Record<string, any> = {
  render_altair: (args: { json_graph: string }) => {
    return args.json_graph;
  },
  fetchuserdata: (args: { userid: number }) => {
    return fetchBankdetails(args?.userid);
  },
  fetchdebit: (args: { userid: number }) => {
    return fetchdebit(args.userid);
  },
  fetchcredit: (args: { userid: number }) => {
    return fetchcredit(args.userid);
  },
  getLastTransaction: (args: { userid: number }) => {
    return getLastTransaction(args.userid);
  },
  fetchBankBalance: (args: { userid: number }) => {
    return fetchUserBalance(args.userid);
  },
  getSchemeByBankBalance: (args: { balance: number }) => {
    return fetchAvailableSchemes(args.balance);
  },
  getLoanByBankBalance: (args: { balance: number }) => {
    return fetchAvailableLoanSchemes(args.balance);
  },
  getLoanByType: (args: { balance: number; loantype: string }) => {
    return fetchAvailableLoanType(args.balance, args.loantype);
  },
  issueTransaction: (args: {
    userid: number;
    amount: number;
    type: "credit" | "debit";
    description?: string;
  }) => {
    return addTransaction(args.userid, args.amount, args.type, args.description);
  },
  transferToPerson: (args: { userid: number, recieverid:number, amount:number, description:string }) => {
    return p2ptransfer(args.userid, args.recieverid, args.amount, args.description);
  },
  issuedScheme: (args: {
    userid: string;
    provider_name: string;
    type: string;
    amount: number;
    category: string;
    tenure: string;
  }) => {
    return issuefianancial(
      args.userid,
      args.provider_name,
      args.type,
      args.amount,
      args.category,
      args.tenure
    );
  },
  createComplaint: (args :{userid:number, complainttext:string}) => {
    return addComplaint(args.userid, args.complainttext);
  },
  getIssuedLoanSchemes:(args: { userid: number }) => {
    return fetchIssuedLoanSchemes(args.userid);
  } 
};

export const declaration: FunctionDeclaration[] = [
  {
    name: "fetchuserdata",
    description:
      "Fetches user bank details. This data contains details about a user, including user ID, name, email, phone, account status, monthly income, savings, credit score, gender, age, and associated account ID.",
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        userid: {
          type: SchemaType.NUMBER,
          description: "The user's account number to fetch details",
        },
      },
      required: ["userid"],
    },
  },
  {
    name: "render_altair",
    description: "Displays an altair graph in json format.",
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        json_graph: {
          type: SchemaType.STRING,
          description:
            "JSON STRING representation of the graph to render. Must be a string, not a json object",
        },
      },
      required: ["json_graph"],
    },
  },
  {
    name: "fetchdebit",
    description:
      "Fetches user debit details. returns debit transactions. debit transactions are expences of the users. the data contains details about a financial transaction, including type, amount, date, description",
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        userid: {
          type: SchemaType.NUMBER,
          description: "The user's account number to fetch details",
        },
      },
      required: ["userid"],
    },
  },
  {
    name: "fetchcredit",
    description:
      "Fetches user credit details. Returns credit transactions. Credit transactions represent income or credits to the user's account. The data contains details about a financial transaction, including type, amount, date, description.",
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        userid: {
          type: SchemaType.NUMBER,
          description: "The user's account number to fetch details",
        },
      },
      required: ["userid"],
    },
  },
  {
    name: "getLastTransaction",
    description:
      "fetch user last transaction details using user_id. This contains details about the financial transaction, including type, amount, date, description",
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        userid: {
          type: SchemaType.NUMBER,
          description: "The user's id to fetch last transaction Detail",
        },
      },
      required: ["userid"],
    },
  },
  {
    name: "fetchBankBalance",
    description:
      "This gives the details about account type, balance associated with the userid",
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        userid: {
          type: SchemaType.NUMBER,
          description: "The user's id to fetch bank balance details",
        },
      },
      required: ["userid"],
    },
  },
  {
    name: "getSchemeByBankBalance",
    description:
      "call 'fetchBankBalance' before calling this, to get the users bank balance which will be the balance required for this function. This function gives details about investment scheme based on user balance, the data includes scheme name, type, minimum and maximum investment, tenure, interest rate or return, risk level, tax benefits, eligibility criteria, and withdrawal rules. which could be useful to give personalised financial advice for saving and investment. If the data given by this function is more than 5 entries then ask users questions based on the attributes of the recieved data (like based on tenure user wants, eligliblity criteria, intrest rate, risk tolerance of user, withdrawl flexiblity etc.. ) to narrow down to give user best scheme. ask user questions to narraw down to best scheme if the user is confused",
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        balance: {
          type: SchemaType.NUMBER,
          description:
            "User Should have minimum bank balance to invest in the scheme, this collects the balance from 'fetchBankBalance' to get appropriate schemes according to the balance",
        },
      },
      required: ["balance"],
    },
  },
  {
    name: "getLoanByBankBalance",
    description:
      "call 'fetchBankBalance' before calling this, to get the users bank balance which will be the balance required for this function. This function gives details about loan based on user balance, the data includes loan_provider, loan_type, tenure, interst rate, risk level, tax benefits, eligibity criteria, withdrawals rules, min_amount, max_amount which could be useful to give personalised loan advice. If the data given by this function is more than 5 entries then ask users questions based on the attributes of the recieved data (like based on tenure user wants, eligliblity criteria, intrest rate, risk tolerance of user, withdrawal_rules etc.. ) to narrow down to give user best loan data. ask user questions to narraw down to best loan scheme if the user is confused",
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        balance: {
          type: SchemaType.NUMBER,
          description:
            "User Should have minimum bank balance to invest in the scheme, this collects the balance from 'fetchBankBalance' to get appropriate schemes according to the balance",
        },
      },
      required: ["balance"],
    },
  },
  {
    name: "getLoanByType",
    description:
      "Before using this function, call 'fetchBankBalance' to retrieve the user's current bank balance. This function fetches the loan details based on the specified loan type user will tell the type he wants or ask if necessary. The data includes loan type, tenure, minimum amount, maximum amount, interest rate, risk level, eligibility criteria, and withdrawal rules. help user make correct decision based on the attributes of the data and user's status by asking questions and explaning data if necessary",
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        type: {
          type: SchemaType.STRING,
          description:
            "The type of loan which can be personal | housing | educational",
        },
        balance: {
          type: SchemaType.NUMBER,
          description: "The user's account number to fetch details",
        },
      },
      required: ["type", "balance"],
    },
  },
  {
    name: "issueTransaction",
    description:
      "This initiates a transaction in the bank this can be used to pay bills etc. it is post endpoint that takes in the userid, amount,type of transaction (credit or debit) and decscription of transaction for which the transaction is being executed. It returns the final balance after the transactions or error if any occours.",
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        userid: {
          type: SchemaType.NUMBER,
          description: "Users account number to fethc the details",
        },
        amount: {
          type: SchemaType.NUMBER,
          description: "Transaction amount",
        },
        type: {
          type: SchemaType.STRING,
          description: "Type of transaction credit or debit",
        },
        description: {
          type: SchemaType.STRING,
          description: "Description of transaction",
        },
      },
      required: ["userid", "amount", "type"],
    },
  },
  {
    name: "issuedScheme",
    description:
      "This creates a record of an issued loan or scheme. It is a POST endpoint that takes in details such as the user's ID, provider name, type of scheme, amount, category, and tenure. The data from the loan or schemes can be used to create this entry. It returns a confirmation of the issued scheme or an error if any occurs. Example: A Fixed Deposit (FD) is a low-risk savings option where individuals can invest between ₹10,000 and ₹50,00,000 for a fixed tenure of 1 to 10 years. It offers guaranteed returns with interest paid either periodically or at maturity, making it ideal for stable, risk-free savings growth. LIC HFL offers a flexible Personal Loan with a loan amount ranging from ₹50,000 to ₹50,00,000 . With an affordable interest rate starting at 6.9%, this loan carries a moderate risk level. Eligibility is based on SBI’s criteria, making it accessible for many. Whether you need funds for personal expenses or to invest in a project, this loan offers the flexibility to achieve your financial goals. Apply today and take the next step towards your financial needs!",
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        userid: {
          type: SchemaType.NUMBER,
          description:
            "User's unique identifier for whom the scheme is being issued.",
        },
        provider_name: {
          type: SchemaType.STRING,
          description: "The name of the provider issuing the scheme.",
        },
        type: {
          type: SchemaType.STRING,
          description: "The type of scheme or loan being issued.",
        },
        amount: {
          type: SchemaType.NUMBER,
          description: "The amount involved in the scheme or loan.",
        },
        category: {
          type: SchemaType.STRING,
          description:
            "The category under which the scheme falls (e.g., housing, education, etc.).",
        },
        tenure: {
          type: SchemaType.STRING,
          description: "The tenure or duration of the scheme or loan.",
        },
      },
      required: [
        "userid",
        "provider_name",
        "type",
        "amount",
        "category",
        "tenure",
      ],
    },
  },
  {
    name: "issueLoan",
    description:
      "Use it to issue a loan, which user selects from the list of loans received from 'getLoanByBankBalance' according to his bank balance or from 'getLoanByType' according to the type of loan he wants. Then issue a 'issueTransaction' with a type of 'credit'. Then if the issueTransaction occurs without any errors run the 'issuedScheme' with the data from the transcation and the loan details",
  },
  {
    name: "issueScheme",
    description:
      "Use it to issue a scheme which user selects a scheme from the list of the schemes displayed when using 'getSchemeByBankBalance'. Then issue a 'issueTransaction' with a type of 'debit'. Then if the issueTransaction occurs without any errors run the 'issuedScheme' with the data from the transcation and scheme details",
  },
  {
    name: "transferToPerson",
    description:
      "transfer money from person to person. This function allows the transfer mone from the user's account to the receiver’s account. The transaction is carried out by specifying the users id, the receivers id, and the amount to be transferred.",
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        userid: {
          type: SchemaType.NUMBER,
          description: "The user's user id to send money.",
        },
        recieverid: {
          type: SchemaType.NUMBER,
          description: "The reciever's user id to recieve the transfered money.",
        },
        amount:{
          type: SchemaType.NUMBER,
          description: "Amount to be transefer from the sender to the rceiver"
        },
        description: {
          type: SchemaType.STRING,
          description: "Automatically generate a description of the money transfer process. eg. sender sent to reciever. dont ask description from user auto generate it."
        }
      },
      required: ["userid","recieverid","amount","description"],
    },
  },
  {
    name: "createComplaint",
    description:
      "This is used for creating a complaint in the system.The complaint is created by providing the necessary information, like The complaint_text field allows the user to add specific details about their issue.",
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        userid: {
          type: SchemaType.NUMBER,
          description: "The user's account number to fetch details",
        },
        complainttext:{
          type: SchemaType.STRING,
          description:"A string field where the user provides detailed information about their complaint or issue. This can include any concerns, problems, or feedback the user wishes to report "
        }
      },
      required: ["userid","complainttext"],
    },
  },
  {
    name: "getIssuedLoanSchemes",
    description:
      "This gives financial loans and investing schemes issued to the user or user has invested in. The data contains provider_name, type, amount, category, tenure",
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        userid: {
          type: SchemaType.NUMBER,
          description: "The user's account number to fetch details",
        },
      },
      required: ["userid"],
    },
  },
  

];
