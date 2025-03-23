import axios from "axios";

const SUPABASE_URL = import.meta.env.VITE_HOST_URL as string;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string;
if (typeof SUPABASE_URL !== "string" || typeof SUPABASE_ANON_KEY !== "string") {
  throw new Error("set SUPABASE_API_KEY in .env");
}
// Spending
export const fetchdebit = async (userid: number) => {
  try {
    const response = await axios.get(
      `${SUPABASE_URL}/rest/v1/transaction?user_id=eq.${userid}&transaction_type=eq.debit`,
      {
        headers: {
          apikey: SUPABASE_ANON_KEY,
          "Accept-Profile": "public",
        },
      }
    );

    if (response.status === 200) {
      const totalSpent = response.data.reduce(
        (total: number, transaction: { amount: number }) =>
          total + transaction.amount,
        0
      );
      return { totalSpent: totalSpent, spending: response.data }; // Return total spending for last month
    } else {
      return "Error fetching spending data.";
    }
  } catch (error) {
    console.error("Error fetching spending last month:", error);
    return { error };
  }
};

export const fetchcredit = async (userid: number) => {
  try {
    const response = await axios.get(
      `${SUPABASE_URL}/rest/v1/transaction?user_id=eq.${userid}&transaction_type=eq.credit`,
      {
        headers: {
          apikey: SUPABASE_ANON_KEY,
          "Accept-Profile": "public",
        },
      }
    );

    if (response.status === 200) {
      const totalCredited = response.data.reduce(
        (total: number, transaction: { amount: number }) =>
          total + transaction.amount,
        0
      );
      return { totalCredited: totalCredited, recievedCredit: response.data }; // Return total spending for last month
    } else {
      return "Error fetching spending data.";
    }
  } catch (error) {
    console.error("Error fetching spending last month:", error);
    return { error };
  }
};

export const fetchBankdetails = async (userid: number) => {
  try {
    const response = await axios.get(
      `${SUPABASE_URL}/rest/v1/user?user_id=eq.${userid}`,
      {
        headers: {
          apikey: SUPABASE_ANON_KEY,
          "Accept-Profile": "public",
        },
      }
    );

    if (response.status === 200) {
      return response.data; // User data
    } else {
      return `Error fetching user data: ${response.statusText}`;
    }
  } catch (error) {
    console.error("Error fetching user data:", error);
    return { error }; // Rethrow the error for further handling
  }
};

export const getLastTransaction = async (userid: number) => {
  try {
    const response = await axios.get(
      `${SUPABASE_URL}/rest/v1/transaction?user_id=eq.${userid}&order=transaction_date.desc&limit=1`,
      {
        headers: {
          apikey: SUPABASE_ANON_KEY,
          "Accept-Profile": "public",
        },
      }
    );

    if (response.status === 200 && response.data.length > 0) {
      return response.data[0]; // Return the last transaction
    } else {
      return "No transactions found.";
    }
  } catch (error) {
    console.error("Error fetching last transaction:", error);
    return { error };
  }
};

export const fetchUserBalance = async (userid: number) => {
  try {
    const response = await axios.get(
      `${SUPABASE_URL}/rest/v1/account?user_id=eq.${userid}`,
      {
        headers: {
          apikey: SUPABASE_ANON_KEY,
          "Accept-Profile": "public",
        },
      }
    );

    if (response.status === 200) {
      // Check if any account data is returned
      if (response.data.length > 0) {
        const balance = response.data[0].balance; // Get the balance of the first account
        return balance; // Return the user's bank balance
      } else {
        return "No account found for this user ID.";
      }
    } else {
      return "Error fetching user balance data.";
    }
  } catch (error) {
    console.error("Error fetching user balance:", error);
    return { error }; // Rethrow the error for further handling
  }
};

export async function fetchAvailableSchemes(balance: number) {
  try {
    // Fetch available schemes based on the minimum investment criteria
    const response = await axios.get(
      `${SUPABASE_URL}/rest/v1/scheme?min_investment=lte.${balance}`,
      {
        headers: {
          apikey: SUPABASE_ANON_KEY,
          "Accept-Profile": "public",
        },
      }
    );

    if (response.status === 200 && response.data.length > 0) {
      return response.data.slice(3);
    } else {
      return "No transactions found.";
    }
  } catch (error) {
    console.error("Error fetching available schemes:", error);
    return { error: "An error occurred while fetching available schemes" };
  }
}

export const fetchAvailableLoanSchemes = async (userBalance: number) => {
  try {
    if (userBalance <= 0) {
      return "User balance must be greater than zero.";
    }

    const response = await axios.get(
      `${SUPABASE_URL}/rest/v1/loan?min_amount=lte.${userBalance}`,
      {
        headers: {
          apikey: SUPABASE_ANON_KEY,
          "Accept-Profile": "public",
        },
      }
    );

    if (response.status === 200) {
      return response.data;
    } else {
      return "Error fetching available loan schemes.";
    }
  } catch (error) {
    console.error("Error fetching available loan schemes:", error);
    return { error };
  }
};

export const fetchAvailableLoanType = async (
  userBalance: number,
  loanType: string
) => {
  try {
    if (userBalance <= 0) {
      return "User  balance must be greater than zero.";
    }

    const response = await axios.get(
      `${SUPABASE_URL}/rest/v1/loan?loan_type=eq.${loanType}&min_amount<=lte.${userBalance}`,
      {
        headers: {
          apikey: SUPABASE_ANON_KEY,
          "Accept-Profile": "public",
        },
      }
    );

    if (response.status === 200) {
      return response.data;
    } else {
      return "Error fetching available personal loans.";
    }
  } catch (error) {
    console.error("Error fetching available personal loans:", error);
    return { error };
  }
};

interface AccountResponse {
  account_id: number;
  user_id: number;
  account_type: string;
  balance: number;
}
//comnbine perdorm transaction for p2p transfer
async function performtransaction(
  userid: number,
  amount: number,
  type: "credit" | "debit"
): Promise<
  | {
      error: string;
    }
  | AccountResponse
> {
  try {
    console.log("performTransaction", userid);
    const response = await axios.get(
      `${SUPABASE_URL}/rest/v1/account?user_id=eq.${userid}`,
      {
        headers: {
          apikey: SUPABASE_ANON_KEY,
          "Accept-Profile": "public",
        },
      }
    );
    if ([200, 201, 202].includes(response.status)) {
      if (!response.data || response.data.length === 0) {
        return { error: "Account not found" };
      }
      //console.log(response);
      const account = response.data[0] as AccountResponse;
      const newBalance =
        type === "credit" ? account.balance + amount : account.balance - amount;

      if (type === "debit" && newBalance < 0) {
        return { error: "Insufficient funds" };
      }

      const updateResponse = await axios.put(
        `${SUPABASE_URL}/rest/v1/account?account_id=eq.${account.account_id}`,
        {
          account_id: account.account_id,
          user_id: account.user_id,
          account_type: account.account_type,
          balance: newBalance,
        },
        {
          headers: {
            apikey: SUPABASE_ANON_KEY,
            "Content-Type": "application/json",
            "Content-Profile": "public",
          },
        }
      );

      if (updateResponse.status === 204) {
        return { ...account, balance: newBalance };
      }

      return { error: `Error updating balance: ${updateResponse.statusText}` };
    } else {
      return { error: `Error fetching user data: ${response.statusText}` };
    }
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "An unknown error occurred";
    return { error: errorMessage };
  }
}

export async function addTransaction(
  userid: number,
  amount: number,
  type: "credit" | "debit",
  description?: string
): Promise<
  | {
      error: string;
    }
  | {
      success: boolean;
    }
> {
  try {
    console.log("addTransaction", userid);
    const account = await performtransaction(userid, amount, type);
    if ("error" in account) {
      return { error: "Account not found" };
    }

    const response = await axios.post(
      `${SUPABASE_URL}/rest/v1/transaction`,
      {
        account_id: account.account_id,
        amount,
        transaction_type: type,
        description,
        user_id: userid,
      },
      {
        headers: {
          apikey: SUPABASE_ANON_KEY,
          "Content-Profile": "public",
        },
      }
    );
    if (response.status !== 201) {
      return { error: "Error adding transaction" };
    } else return { success: true };
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "An unknown error occurred";
    return { error: errorMessage };
  }
}

export async function p2ptransfer(
  sender: number,
  receiver: number,
  amount: number,
  description: string
) {
  console.log("p2p", sender, receiver);
  const debitResponse = await addTransaction(
    sender,
    amount,
    "debit",
    description
  );
  if ("error" in debitResponse) {
    return debitResponse;
  }

  const creditResponse = await addTransaction(
    receiver,
    amount,
    "credit",
    description
  );
  if ("error" in creditResponse) {
    return creditResponse;
  }

  return { success: true };
}

export async function issuefianancial(
  userid: string,
  provider_name: string,
  type: string,
  amount: number,
  category: string,
  tenure: string
) {
  try {
    const response = await axios.post(
      `${SUPABASE_URL}/rest/v1/issued_financials`,
      {
        user_id: userid,
        provider_name: provider_name,
        type: type,
        amount: amount,
        category: category,
        tenure: tenure,
      },
      {
        headers: {
          apikey: SUPABASE_ANON_KEY,
          "Content-Profile": "public",
        },
      }
    );
    return response.status;
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "An unknown error occurred";
    return { error: errorMessage };
  }
}

export const fetchIssuedLoanSchemes = async (userId: number): Promise<any> => {
  try {
    const response = await axios.get(
      `${SUPABASE_URL}/rest/v1/issued_financials?user_id=eq.${userId}`,
      {
        headers: {
          apikey: SUPABASE_ANON_KEY,
          "Content-Profile": "public",
        },
      }
    );

    if (response.status === 200) {
      return response.data;
    } else {
      return "Error fetching issued loan and schemes data.";
    }
  } catch (error: any) {
    console.error("Error fetching financial records:", error.message || error);
    return { error };
  }
};

export const addComplaint = async (
  userId: number,
  complaintText: string
): Promise<any> => {
  try {
    const complaintData = {
      user_id: userId,
      complaints: complaintText,
    };

    const response = await axios.post(
      `${SUPABASE_URL}/rest/v1/complaint`,
      complaintData,
      {
        headers: {
          apikey: SUPABASE_ANON_KEY,
          "Accept-Profile": "public",
        },
      }
    );

    if (response.status === 201) {
      return response.status;
    } else {
      return { error: "error adding complaint" };
    }
  } catch (error) {
    console.error("Error adding complaint:", error);
    return { error: "error adding complaint" };
  }
};
