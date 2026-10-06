// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @notice Who may pin besides the admin. The $home lock gate, once SeedMe's contract is known.
interface IGate {
    function allowed(address who) external view returns (bool);
}

/// @title The Homebase map: Luma event slugs, pinned by the wallets the gate lets through.
/// @notice The site reads `list()` and looks each slug up on Luma; nothing else is stored.
contract HomebaseMap {
    struct Pin {
        string slug;
        address by;
        uint64 pinnedAt;
    }

    address public admin;
    IGate public gate;

    Pin[] private pins;
    /// @dev keccak256(slug) => index in `pins` plus one, so zero means not pinned.
    mapping(bytes32 => uint256) private slots;

    event Pinned(string slug, address indexed by);
    event Unpinned(string slug, address indexed by);
    event AdminChanged(address indexed admin);
    event GateChanged(address indexed gate);

    error NotAdmin();
    error NotAllowed();
    error BadSlug();
    error AlreadyPinned();
    error NotPinned();
    error BadGate();

    constructor(address admin_) {
        admin = admin_;
        emit AdminChanged(admin_);
    }

    modifier onlyAdmin() {
        if (msg.sender != admin) revert NotAdmin();
        _;
    }

    /// @notice Whether a wallet may pin: the admin always, anyone else the gate vouches for.
    function canPin(address who) public view returns (bool) {
        if (who == admin) return true;
        if (address(gate) == address(0)) return false;
        try gate.allowed(who) returns (bool ok) {
            return ok;
        } catch {
            return false;
        }
    }

    /// @notice Pins a Luma event by its slug, the path of its page.
    function pin(string calldata slug) external {
        if (!canPin(msg.sender)) revert NotAllowed();
        uint256 length = bytes(slug).length;
        if (length == 0 || length > 64) revert BadSlug();
        bytes32 key = keccak256(bytes(slug));
        if (slots[key] != 0) revert AlreadyPinned();
        pins.push(Pin(slug, msg.sender, uint64(block.timestamp)));
        slots[key] = pins.length;
        emit Pinned(slug, msg.sender);
    }

    /// @notice Takes a pin off: the admin may take any, a pinner their own.
    function unpin(string calldata slug) external {
        bytes32 key = keccak256(bytes(slug));
        uint256 slot = slots[key];
        if (slot == 0) revert NotPinned();
        if (msg.sender != admin && msg.sender != pins[slot - 1].by) revert NotAllowed();
        uint256 last = pins.length - 1;
        if (slot - 1 != last) {
            Pin memory moved = pins[last];
            pins[slot - 1] = moved;
            slots[keccak256(bytes(moved.slug))] = slot;
        }
        pins.pop();
        delete slots[key];
        emit Unpinned(slug, msg.sender);
    }

    function list() external view returns (Pin[] memory) {
        return pins;
    }

    function count() external view returns (uint256) {
        return pins.length;
    }

    function setAdmin(address admin_) external onlyAdmin {
        admin = admin_;
        emit AdminChanged(admin_);
    }

    /// @notice Points the map at a gate, or at nothing to leave the admin alone again.
    function setGate(IGate gate_) external onlyAdmin {
        if (address(gate_) != address(0) && address(gate_).code.length == 0) revert BadGate();
        gate = gate_;
        emit GateChanged(address(gate_));
    }
}
