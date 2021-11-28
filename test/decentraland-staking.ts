import {ethers} from "hardhat";
import {expect} from 'chai';
import {SignerWithAddress} from "@nomiclabs/hardhat-ethers/signers";
import {Contract} from "ethers";

describe("LandWorks Decentraland Staking", () => {

	let owner: SignerWithAddress, nftHolder: SignerWithAddress, nonNftHolder: SignerWithAddress,
		anotherNftHolder: SignerWithAddress;
	let mockLandWorksNft: Contract, staking: Contract, landRegistryMock: Contract, estateRegistryMock: Contract,
		mockENTR: Contract;
	let snapshotId: any;

	const METAVERSE_ID = 1;
	const REWARD_RATE = 100;

	before(async () => {
		const signers = await ethers.getSigners();
		owner = signers[0];
		nftHolder = signers[1];
		nonNftHolder = signers[2];
		anotherNftHolder = signers[3];

		const EstateRegistryMock = await ethers.getContractFactory("EstateRegistryMock");
		estateRegistryMock = await EstateRegistryMock.deploy();

		const LandRegistryMock = await ethers.getContractFactory("LandRegistryMock");
		landRegistryMock = await LandRegistryMock.deploy();

		const MockENTR = await ethers.getContractFactory("MockENTR");
		mockENTR = await MockENTR.deploy();

		const MockLandWorksNFT = await ethers.getContractFactory("MockLandWorksNFT");
		mockLandWorksNft = await MockLandWorksNFT.deploy(landRegistryMock.address, estateRegistryMock.address);

		const LandWorksDecentralandStaking = await ethers.getContractFactory("LandWorksDecentralandStaking");
		staking = await LandWorksDecentralandStaking.deploy(
			mockLandWorksNft.address,
			mockENTR.address,
			REWARD_RATE,
			METAVERSE_ID,
			landRegistryMock.address,
			estateRegistryMock.address
		);
	});

	beforeEach(async function () {
		snapshotId = await ethers.provider.send('evm_snapshot', []);
	});

	afterEach(async function () {
		await ethers.provider.send('evm_revert', [snapshotId]);
	});

	it("Should initialize properly with correct configuration", async () => {
		expect(await staking.rewardsToken()).to.equal(mockENTR.address);
		expect(await staking.stakingToken()).to.equal(mockLandWorksNft.address);
		expect(await staking.rewardRate()).to.equal(100);
		expect(await staking.metaverseId()).to.equal(METAVERSE_ID);
		expect(await staking.landRegistry()).to.equal(landRegistryMock.address);
		expect(await staking.estateRegistry()).to.equal(estateRegistryMock.address);
	});

	describe("Staking", () => {

		it("Should stake LandWorks NFTs successfully", async () => {
			await mockLandWorksNft.generateTestAssets(2, nftHolder.address);
			await mockLandWorksNft.connect(nftHolder).setApprovalForAll(staking.address, true);

			await staking.connect(nftHolder).stake([1, 2]);

			const balanceOfContract = await mockLandWorksNft.balanceOf(staking.address);
			expect(balanceOfContract.toNumber()).to.equal(2);
			expect(await staking.totalSupply()).to.equal(6);
			expect(await staking.balances(nftHolder.address)).to.equal(6);
			expect(await staking.stakedAssets(1)).to.equal(nftHolder.address);
			expect(await staking.stakedAssets(2)).to.equal(nftHolder.address);
			expect(await mockLandWorksNft.consumerOf(1)).to.equal(nftHolder.address);
			expect(await mockLandWorksNft.consumerOf(2)).to.equal(nftHolder.address);
		});

		it("Should update fields correctly on second time staking", async () => {
			await mockLandWorksNft.generateTestAssets(3, nftHolder.address);
			await mockLandWorksNft.connect(nftHolder).setApprovalForAll(staking.address, true);
			await staking.connect(nftHolder).stake([1]);
			expect((await mockLandWorksNft.balanceOf(staking.address)).toNumber()).to.equal(1);

			await staking.connect(nftHolder).stake([2, 3]);
			const balanceOfContract = await mockLandWorksNft.balanceOf(staking.address);
			expect(balanceOfContract.toNumber()).to.equal(3);
			expect(await staking.totalSupply()).to.equal(7);
			expect(await staking.balances(nftHolder.address)).to.equal(7);
			expect(await staking.stakedAssets(1)).to.equal(nftHolder.address);
			expect(await staking.stakedAssets(2)).to.equal(nftHolder.address);
			expect(await staking.stakedAssets(3)).to.equal(nftHolder.address);
			expect(await mockLandWorksNft.consumerOf(1)).to.equal(nftHolder.address);
			expect(await mockLandWorksNft.consumerOf(2)).to.equal(nftHolder.address);
			expect(await mockLandWorksNft.consumerOf(3)).to.equal(nftHolder.address);
		})

		it("Should emit events correctly", async () => {
			await mockLandWorksNft.generateTestAssets(2, nftHolder.address);
			await mockLandWorksNft.connect(nftHolder).setApprovalForAll(staking.address, true);

			await expect(staking.connect(nftHolder).stake([1, 2]))
				.to.emit(mockLandWorksNft, "Transfer").withArgs(nftHolder.address, staking.address, 1)
				.to.emit(mockLandWorksNft, "ConsumerChanged").withArgs(staking.address, nftHolder.address, 1)
				.to.emit(mockLandWorksNft, "Transfer").withArgs(nftHolder.address, staking.address, 2)
				.to.emit(mockLandWorksNft, "ConsumerChanged").withArgs(staking.address, nftHolder.address, 2)
				.to.emit(staking, "Stake").withArgs(nftHolder.address, 6, [1, 2])
		});

		it("Should not allow staking of unsupported metaverse Id", async () => {
			const expectedRevertMessage = 'Staking: Invalid metaverseId';
			await mockLandWorksNft.generateWithInvalidMetaverseId(nftHolder.address);
			await mockLandWorksNft.connect(nftHolder).setApprovalForAll(staking.address, true);

			await expect(staking.connect(nftHolder).stake([1])).to.be.revertedWith(expectedRevertMessage);
		});

		it("Should not allow staking of unsupported registry", async () => {
			const expectedRevertMessage = 'Staking: Invalid metaverseRegistry';
			await mockLandWorksNft.generateWithInvalidRegistry(nftHolder.address);
			await mockLandWorksNft.connect(nftHolder).setApprovalForAll(staking.address, true);
			await expect(staking.connect(nftHolder).stake([1])).to.be.revertedWith(expectedRevertMessage);
		});

		it("Should revert on staking non-existing tokens", async () => {
			const expectedRevertMessage = 'ERC721: operator query for nonexistent token';
			await mockLandWorksNft.connect(nftHolder).setApprovalForAll(staking.address, true);
			await expect(staking.connect(nftHolder).stake([100])).to.be.revertedWith(expectedRevertMessage);
		});

		it("Should revert on staking non-owned tokens", async () => {
			const expectedRevertMessage = 'ERC721: transfer caller is not owner nor approved';
			await mockLandWorksNft.generateTestAssets(1, owner.address);
			await mockLandWorksNft.connect(nonNftHolder).setApprovalForAll(staking.address, true);
			await expect(staking.connect(nonNftHolder).stake([1])).to.be.revertedWith(expectedRevertMessage);
		});

	});

	describe('Withdrawal', async () => {

		beforeEach(async () => {
			await mockLandWorksNft.generateTestAssets(2, nftHolder.address);
			await mockLandWorksNft.connect(nftHolder).setApprovalForAll(staking.address, true);
			await staking.connect(nftHolder).stake([1, 2]);
		});

		it("Should withdraw staked LandWorks NFTs successfully", async () => {
			const balanceOfContractBefore = await mockLandWorksNft.balanceOf(staking.address);
			expect(balanceOfContractBefore.toNumber()).to.equal(2);
			expect(await staking.totalSupply()).to.equal(6);
			expect(await staking.balances(nftHolder.address)).to.equal(6);
			expect(await staking.stakedAssets(1)).to.equal(nftHolder.address);
			expect(await staking.stakedAssets(2)).to.equal(nftHolder.address);
			expect(await mockLandWorksNft.consumerOf(1)).to.equal(nftHolder.address);
			expect(await mockLandWorksNft.consumerOf(2)).to.equal(nftHolder.address);

			await staking.connect(nftHolder).withdraw([1, 2]);
			const balanceOfContractAfter = await mockLandWorksNft.balanceOf(staking.address);
			expect(balanceOfContractAfter.toNumber()).to.equal(0);

			const balanceOfStaker = await mockLandWorksNft.balanceOf(nftHolder.address);
			expect(balanceOfStaker.toNumber()).to.equal(2);
			expect(await mockLandWorksNft.ownerOf(1)).to.equal(nftHolder.address);
			expect(await mockLandWorksNft.ownerOf(2)).to.equal(nftHolder.address);
			expect(await staking.totalSupply()).to.equal(0);
			expect(await staking.balances(nftHolder.address)).to.equal(0);
			expect(await staking.stakedAssets(1)).to.equal(ethers.constants.AddressZero);
			expect(await staking.stakedAssets(2)).to.equal(ethers.constants.AddressZero);
			expect(await mockLandWorksNft.consumerOf(1)).to.equal(ethers.constants.AddressZero);
			expect(await mockLandWorksNft.consumerOf(2)).to.equal(ethers.constants.AddressZero);
		});

		it("Should emit events correctly on Withdraw", async () => {
			await expect(staking.connect(nftHolder).withdraw([1, 2]))
				.to.emit(mockLandWorksNft, "Transfer").withArgs(staking.address, nftHolder.address, 1)
				.to.emit(mockLandWorksNft, "ConsumerChanged").withArgs(staking.address, ethers.constants.AddressZero, 1)
				.to.emit(mockLandWorksNft, "Transfer").withArgs(staking.address, nftHolder.address, 2)
				.to.emit(mockLandWorksNft, "ConsumerChanged").withArgs(staking.address, ethers.constants.AddressZero, 2)
				.to.emit(staking, "StakeWithdraw").withArgs(nftHolder.address, 6, [1, 2]);
		});

		it("Should not be able to withdraw LandWorks NFTs staked by other person", async () => {
			const expectedRevertMessage = 'Staking: Not owner of the token';
			await expect(staking.connect(nonNftHolder).withdraw([1, 2])).revertedWith(expectedRevertMessage);
		});
	});

	describe('Rewards', async () => {

		const THOUSAND = ethers.utils.parseEther("1000");

		before(async () => {
			// Send rewards to staking contract
			await mockENTR.mint(staking.address, THOUSAND);

			await mockLandWorksNft.generateTestAssets(10, nftHolder.address);
			await mockLandWorksNft.generateTestAssets(10, anotherNftHolder.address);
			await mockLandWorksNft.connect(nftHolder).setApprovalForAll(staking.address, true);
			await mockLandWorksNft.connect(anotherNftHolder).setApprovalForAll(staking.address, true);
		});

		it('Should accrue correct amount for one holder per second', async () => {
			await staking.connect(nftHolder).stake([1]);
			const earnedBefore = await staking.earned(nftHolder.address);
			await ethers.provider.send("evm_mine", []);

			const earnedAfter = await staking.earned(nftHolder.address);
			expect(earnedBefore + REWARD_RATE).to.equal(earnedAfter);

			// Accrues 100 more as reward
			await staking.connect(nftHolder).getReward();
			expect(await mockENTR.balanceOf(nftHolder.address)).to.equal(2 * REWARD_RATE);
			expect(await mockENTR.balanceOf(staking.address)).to.equal(THOUSAND.sub(2 * REWARD_RATE));
		})

		it('Should accrue correct amount for balance > 1 per second', async () => {
			await staking.connect(nftHolder).stake([1, 2, 3, 4, 5, 6, 7, 8, 9]);
			const earnedBefore = await staking.earned(nftHolder.address);
			await ethers.provider.send("evm_mine", []);

			const earnedAfter = await staking.earned(nftHolder.address);
			expect(earnedBefore + REWARD_RATE).to.equal(earnedAfter);

			await staking.connect(nftHolder).getReward();
			expect(await mockENTR.balanceOf(nftHolder.address)).to.equal(2 * REWARD_RATE);
			expect(await mockENTR.balanceOf(staking.address)).to.equal(THOUSAND.sub(2 * REWARD_RATE));
		})

		it('Should accrue correct amount for multiple users per second', async () => {
			await staking.connect(nftHolder).stake([1]);
			const holder1EarnedT0 = await staking.earned(nftHolder.address);

			// 1 second elapses; nftHolder=100; anotherNftHolder=0
			await staking.connect(anotherNftHolder).stake([11]);
			const holder1EarnedT1 = await staking.earned(nftHolder.address);
			const holder2EarnedT0 = await staking.earned(anotherNftHolder.address);

			// 2 seconds elapse; nftHolder=150; anotherNftHolder=50
			await ethers.provider.send("evm_mine", []);
			const holder1EarnedT2 = await staking.earned(nftHolder.address);
			const holder2EarnedT1 = await staking.earned(anotherNftHolder.address);

			// 3 seconds elapse; nftHolder=0; anotherNftHolder=100
			await staking.connect(nftHolder).getReward();
			const holder1EarnedT3 = await staking.earned(nftHolder.address);
			const holder2EarnedT2 = await staking.earned(anotherNftHolder.address);

			// 4 seconds elapse; nftHolder=50; anotherNftHolder=150
			await staking.connect(anotherNftHolder).getReward();
			const holder2EarnedT3 = await staking.earned(anotherNftHolder.address);

			// nftHolder balances
			expect(holder1EarnedT0).to.equal(0);
			expect(holder1EarnedT1).to.equal(REWARD_RATE);
			expect(holder1EarnedT2).to.equal(1.5 * REWARD_RATE);
			expect(holder1EarnedT3).to.equal(0);
			expect(await mockENTR.balanceOf(nftHolder.address)).to.equal(2 * REWARD_RATE);

			// anotherNftHolder balances
			expect(holder2EarnedT0).to.equal(0);
			expect(holder2EarnedT1).to.equal(0.5 * REWARD_RATE);
			expect(holder2EarnedT2).to.equal(REWARD_RATE);
			expect(holder2EarnedT3).to.equal(0);
			expect(await mockENTR.balanceOf(anotherNftHolder.address)).to.equal(1.5 * REWARD_RATE);

			// Staking contract balance
			expect(await mockENTR.balanceOf(staking.address)).to.equal(THOUSAND.sub(3.5 * REWARD_RATE));
		})

		it('Should accrue correct amount for multiple users proportionally to their balance per second', async () => {
			// Balance for nftHolder is 1
			await staking.connect(nftHolder).stake([1]);
			const holder1EarnedT0 = await staking.earned(nftHolder.address);

			// Balance for anotherNftHolder is 4
			// 1 second elapses
			await staking.connect(anotherNftHolder).stake([11, 13, 15, 17]);
			const holder1EarnedT1 = await staking.earned(nftHolder.address);
			const holder2EarnedT0 = await staking.earned(anotherNftHolder.address);

			// 2 second elapse
			await ethers.provider.send("evm_mine", []);

			const holder1EarnedT2 = await staking.earned(nftHolder.address);
			const holder2EarnedT1 = await staking.earned(anotherNftHolder.address);

			// nftHolder accrues 20% of REWARDS_RATE/sec
			// anotherNftHolder accrues 80% of REWARDS_RATE/sec
			await staking.connect(nftHolder).getReward();
			const holder1EarnedT3 = await staking.earned(nftHolder.address);
			const holder2EarnedT2 = await staking.earned(anotherNftHolder.address);

			await staking.connect(anotherNftHolder).getReward();
			const holder1EarnedT4 = await staking.earned(nftHolder.address);
			const holder2EarnedT3 = await staking.earned(anotherNftHolder.address);

			expect(holder1EarnedT0).to.equal(0);
			expect(holder1EarnedT1).to.equal(REWARD_RATE);
			expect(holder1EarnedT2).to.equal(REWARD_RATE + REWARD_RATE / 5);
			expect(holder1EarnedT3).to.equal(0);
			expect(holder1EarnedT4).to.equal(REWARD_RATE / 5);
			expect(await mockENTR.balanceOf(nftHolder.address)).to.equal(REWARD_RATE * (7 / 5));

			expect(holder2EarnedT0).to.equal(0);
			expect(holder2EarnedT1).to.equal(REWARD_RATE * (4 / 5));
			expect(holder2EarnedT2).to.equal(REWARD_RATE * (8 / 5));
			expect(holder2EarnedT3).to.equal(0);
			expect(await mockENTR.balanceOf(anotherNftHolder.address)).to.equal(REWARD_RATE * (12 / 5));

			// Staking contract balance
			expect(await mockENTR.balanceOf(staking.address)).to.equal(THOUSAND.sub(REWARD_RATE * (19 / 5)));
		})

		it('Should emit correct events on Claim', async () => {
			await staking.connect(nftHolder).stake([1]);

			await expect(staking.connect(nftHolder).getReward())
				.to.emit(mockENTR, "Transfer").withArgs(staking.address, nftHolder.address, REWARD_RATE)
				.to.emit(staking, "RewardsClaim").withArgs(nftHolder.address, REWARD_RATE)
		})

	});
});
