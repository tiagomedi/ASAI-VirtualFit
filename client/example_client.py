import socket
import sys

# Create a TCP/IP socket
sock = socket.socket (socket.AF_INET, socket.SOCK_STREAM)

# Connect the socket to the port where the bus is listening
bus_address = ('localhost', 5001)
print ('connecting to {} port {}'.format (*bus_address))
sock.connect (bus_address)

try:
    while True:
      # Send Hello world to servi
      if (input ('Send Hello world to servi ? y/n: ') != 'y'):
        break
      message = b'00016serviHello world'
      print ('sending {!r}'.format (message))
      sock.sendall (message)

      # Look for the response
      print ("Waiting for transaction")
      amount_received = 0
      amount_expected = int(sock.recv (5))

      while amount_received < amount_expected:
          data = sock.recv (amount_expected - amount_received)
          amount_received += len (data)
      print ("Checking servi answer ...")
      print('received {!r}'.format(data))

finally:
    print ('closing socket')
    sock.close ()
