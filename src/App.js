import React, { useEffect, useState } from "react";
import { ToastContainer, toast } from "react-toastify";
import { ethers } from "ethers";
import './App.css';
import abi from "./utils/WavePortal.json";
import BarLoader from "react-spinners/BarLoader";
import Countdown from 'react-countdown';
import 'react-toastify/dist/ReactToastify.css';

const MESSAGE_CHARACTER_LIMIT = 180;

export default function App() {
  // State storing the current account
  const [currentAccount, setCurrentAccount] = useState("");
  const [allWaves, setAllWaves] = useState([]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [nextAvailableWave, setNextAvailableWave] = useState(null);

  const contractAddress = "0x41Fec1EfBB94A1451ac80d4Ad1AE8841843E3D86";
  const contractABI = abi.abi;

  const checkIfWalletIsConnected = async () => {
    try {
      /*
       * Make sure we have access to window.ethereum
       */
      const { ethereum } = window;
      if (!ethereum) {
        console.log("Make sure you have MetaMask");
      } else {
        console.log("We have the ethereum object", ethereum);
      }

      // Check if we're authorised to access the user's wallet
      const accounts = await ethereum.request({ method: "eth_accounts" });

      if (accounts.length !== 0) {
        const account = accounts[0];
        console.log("Found an authorised account: ", account);
        setCurrentAccount(account);
        await getAllWaves();
      } else {
        console.log("No authorised account found");
      }
    } catch (error) {
      console.log(error);
    }
  }

  const connectWallet = async () => {
    try {
      const { ethereum } = window;

      if (!ethereum) {
        alert("Get MetaMask");
        return;
      }

      const accounts = await ethereum.request({ method: "eth_requestAccounts" });
      console.log("Connected", accounts[0]);
      setCurrentAccount(accounts[0]);
      console.log(currentAccount);
      await getAllWaves();
    } catch (error) {
      console.log(error);
    }
  }

  const getAllWaves = async () => {
    const { ethereum } = window;

    if (ethereum) {
      const provider = new ethers.providers.Web3Provider(ethereum);
      const signer = provider.getSigner();
      const wavePortalContract = new ethers.Contract(contractAddress, contractABI, signer);

      const waves = await wavePortalContract.getAllWaves();

      let wavesCleaned = [];
      waves.forEach(wave => {
        wavesCleaned.push({
          address: wave.waver,
          message: wave.message,
          // TODO: Change this magic number into a constant
          timestamp: new Date(wave.timestamp * 1000)
        })
      });

      // Sort waves by timestamp (decreasing). Latest wave will be the first element in the array.
      wavesCleaned.sort((a, b) => b.timestamp - a.timestamp);

      setAllWaves(wavesCleaned);
    }
  }

  const getNextAvailableWave = () => {
    for (const i = 0; i < allWaves.length; i++) {
      const wave = allWaves[i];
      if (wave.address.toLowerCase() == currentAccount.toLowerCase()) {
        // Since the waves are in order of decreasing timestamp, this must be the latest wave for the user.
        // Check when the next available wave is. 
        const nextAvailableWave = new Date(wave.timestamp.getTime() + 15 * 60000);

        if (nextAvailableWave > new Date()) {
          // If the next available wave is in the future, we save it to the state. If the state is not set, we assume that the user is able to wave.
          setNextAvailableWave(nextAvailableWave);
        }
        break;
      }
    }
  }

  const wave = async () => {

    try {
      const { ethereum } = window;

      if (ethereum) {
        const provider = new ethers.providers.Web3Provider(ethereum);
        const signer = provider.getSigner();
        const wavePortalContract = new ethers.Contract(contractAddress, contractABI, signer);

        // Execute wave from smart contract
        const waveTxn = await wavePortalContract.wave(message, { gasLimit: 300000 });
        setLoading(true);
        console.log("Mining...", waveTxn.hash);

        await waveTxn.wait();
        setLoading(false);
        setMessage("");
        console.log("Mined -- ", waveTxn.hash);

        await getAllWaves();
      } else {
        console.log("Ethereum object doesn't exist");
      }
    } catch (error) {
      // User needs to wait 15m before waving again.
      if (error.error.code == -32603) {
        toast.error('Please wait 15 minutes before waving again');
      }
    }
  }

  useEffect(() => {
    let wavePortalContract;

    const onNewWave = (from, message, timestamp) => {
      console.log("NewWave", from, message, timestamp);
      // Due to the issue outlined below with the same event triggering multiple times, we choose 
      // not to append the new wave to the state allWaves array directly, and instead just re-call
      // the smart contract function to get all the waves. This approach ensures that a wave is not
      // shown multiple times in the list of waves.
      getAllWaves();
    }

    if (window.ethereum) {
      const provider = new ethers.providers.Web3Provider(window.ethereum);
      const signer = provider.getSigner();

      wavePortalContract = new ethers.Contract(contractAddress, contractABI, signer);
      // There's currently an issue (https://github.com/ethers-io/ethers.js/issues/2310) where events are scanned
      // starting from the current block, rather than the next block. As a result, if the onNewWave function triggers
      // and updates the state, it will cause the event to be 'emitted' again, which will cause the state to update
      // again and so forth- an infinite loop. Wrapping the subscription in this provider.once callback semi fixes 
      // the issue, but I am still seeing multiple events emitted (although it is no longer infinite).
      provider.once("block", () => {
        wavePortalContract.on("NewWave", onNewWave);
      })
    }

    return () => {
      if (wavePortalContract) {
        wavePortalContract.off("NewWave", onNewWave);
      }
    }
  })

  useEffect(() => {
    checkIfWalletIsConnected();
  }, [])

  useEffect(() => {
    getNextAvailableWave();
  }, [allWaves])

  const handleMessageChange = (event) => {
    setMessage(event.target.value);
  }

  const isButtonDisabled = message.length == 0 || message.length > MESSAGE_CHARACTER_LIMIT || loading || nextAvailableWave;

  const renderLoading = () => {
    return <div style={{ display: "flex", alignContent: "center", justifyContent: "center" }}>
      <BarLoader color={"#FFC83C"} loading={loading} size={50} />
    </div>
  }


  return (
    <div className="mainContainer">
      <div className="dataContainer">
        <div className="header">
          <span role="img">👋 </span> Hey there!
        </div>

        <div className="bio">
          I'm Andrew and I'm a software engineer at Google working on Google Photos. Connect your Ethereum wallet and wave at me!
        </div>
        <div style={{ display: "flex", flexDirection: "column" }}>
          <div style={{ display: "flex", flex: 1 }}>
            <textarea style={{ display: "flex", resize: "none", flex: 1, height: "4rem" }} name="messageText" value={message} onChange={handleMessageChange}></textarea>
          </div>
          <div>
            <h4 style={{ color: message.length < MESSAGE_CHARACTER_LIMIT ? "black" : "red" }}>{`${message.length}/${MESSAGE_CHARACTER_LIMIT}`}</h4>
          </div>
        </div>
        {/* Refactor this into a separate method to render button. */}
        <button className="waveButton" onClick={wave} disabled={isButtonDisabled}>
          {loading ? renderLoading() : nextAvailableWave ? <Countdown date={nextAvailableWave} precision={1} renderer={props => <div>{`Time Until Next Wave: ${props.minutes}:${props.seconds}`}</div>} /> : "Wave"}
        </button>

        {!currentAccount && (
          <button className="waveButton" onClick={connectWallet}>
            Connect Wallet
          </button>
        )}

        {allWaves.map((wave, index) => {
          return (
            <div key={index} style={{ backgroundColor: "OldLace", marginTop: "16px", padding: "8px" }}>
              <div>Address: {wave.address}</div>
              <div>Time: {wave.timestamp.toString()}</div>
              <div>Message: {wave.message}</div>
            </div>)
        })}
      </div>
      <ToastContainer position="bottom-center" />
    </div>
  );
}
